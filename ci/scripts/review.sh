#!/usr/bin/env bash
set -euo pipefail

# Post inline MR discussions with rich markdown formatting and suggestion blocks
# Required env: GITLAB_TOKEN, CI_API_V4_URL, CI_PROJECT_ID,
#   CI_MERGE_REQUEST_IID, CI_COMMIT_SHA, CI_MERGE_REQUEST_DIFF_BASE_SHA,
#   PLOW_COMMAND, PLOW_ROOT, MAX_COMMENTS

MAX="${MAX_COMMENTS:-50}"
if ! [[ "$MAX" =~ ^[0-9]+$ ]]; then
  echo "WARNING: max-comments must be a positive integer, got: ${MAX_COMMENTS}. Using default: 50"
  MAX=50
fi

# Reject path traversal in root
if [[ "${PLOW_ROOT:-}" =~ \.\. ]]; then
  echo "ERROR: root input contains path traversal sequence"
  exit 2
fi

# Auth header
if [ -z "${GITLAB_TOKEN:-}" ]; then
  echo "WARNING: GITLAB_TOKEN is required to create or resolve MR discussions; CI_JOB_TOKEN is read-only for MR notes in the official GitLab API. Skipping inline MR review."
  exit 0
fi
: "${CI_API_V4_URL:?CI_API_V4_URL is required}"
: "${CI_PROJECT_ID:?CI_PROJECT_ID is required}"
: "${CI_MERGE_REQUEST_IID:?CI_MERGE_REQUEST_IID is required}"
AUTH_HEADER="PRIVATE-TOKEN: ${GITLAB_TOKEN}"

NOTES_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}/notes"
DISCUSSIONS_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}/discussions"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=gitlab_common.sh
source "${SCRIPT_DIR}/gitlab_common.sh"

# Initialize two sidecar markers so downstream jobs always see definitive
# values. GitLab CI lacks an equivalent of $GITHUB_OUTPUT for cross-job
# propagation; these greppable text files serve the same role when added to
# `artifacts: paths:`. `plow-skip-reason.txt` is `pagination_failure` only
# when the inline-review POST is actually skipped (multi-discussion abort);
# `plow-dedup-lookup-failed.txt` is `true` on any dedup-lookup failure
# (including the summary-only path where we post a potential duplicate).
#
# IMPORTANT: comment.sh runs BEFORE review.sh in the default template
# (ci/gitlab-ci.yml). If comment.sh hit its dedup-lookup failure path it
# already wrote `true` to plow-dedup-lookup-failed.txt; reinitializing
# unconditionally here would clobber that value and hide the degraded
# state from downstream jobs. Only initialize each marker when the file
# does not already exist.
[ -f plow-skip-reason.txt ] || printf 'none\n' > plow-skip-reason.txt
[ -f plow-dedup-lookup-failed.txt ] || printf 'false\n' > plow-dedup-lookup-failed.txt

load_gitlab_diff_refs() {
  if [ -n "${PLOW_GITLAB_BASE_SHA:-}" ] && [ -n "${PLOW_GITLAB_HEAD_SHA:-}" ]; then
    return 0
  fi
  local diff_refs=""
  diff_refs=$(curl_retry \
    --header "${AUTH_HEADER}" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}" \
    | jq -r '.diff_refs // empty') || {
      echo "WARNING: Failed to fetch MR diff refs; falling back to CI sha variables"
      diff_refs=""
    }
  if [ -n "$diff_refs" ] && echo "$diff_refs" | jq -e '.base_sha and .head_sha' > /dev/null 2>&1; then
    export PLOW_GITLAB_BASE_SHA
    export PLOW_GITLAB_START_SHA
    export PLOW_GITLAB_HEAD_SHA
    PLOW_GITLAB_BASE_SHA=$(echo "$diff_refs" | jq -r '.base_sha')
    PLOW_GITLAB_START_SHA=$(echo "$diff_refs" | jq -r '.start_sha // .base_sha')
    PLOW_GITLAB_HEAD_SHA=$(echo "$diff_refs" | jq -r '.head_sha')
  else
    export PLOW_GITLAB_BASE_SHA="${PLOW_GITLAB_BASE_SHA:-${CI_MERGE_REQUEST_DIFF_BASE_SHA:-}}"
    export PLOW_GITLAB_START_SHA="${PLOW_GITLAB_START_SHA:-${PLOW_GITLAB_BASE_SHA:-}}"
    export PLOW_GITLAB_HEAD_SHA="${PLOW_GITLAB_HEAD_SHA:-${CI_COMMIT_SHA:-}}"
  fi
}

render_with_plow() {
  local format=$1
  local output=$2
  prepare_plow_render_args "$format" || return 1
  load_gitlab_diff_refs
  PLOW_MAX_COMMENTS="$MAX" plow "${PLOW_RENDER_ARGS[@]}" > "$output" 2> plow-review-stderr.log || true
  # Surface plow's structured-error envelope before the schema check so the
  # CLI message lands in the GitLab job log rather than a generic warning.
  if jq -e '.error == true' "$output" > /dev/null 2>&1; then
    echo "WARNING: plow render failed: $(jq -r '.message // "unknown error"' "$output")"
    return 1
  fi
  # Accept both v1 (historical) and v2 (issue #528) schema markers so a
  # consumer running an older bundled template against a newer plow binary
  # continues to render. Future-tolerant: any `plow-review-envelope/v<N>`
  # passes, on the assumption that the back-compat fields (`body`,
  # `comments[].{body,position}`) remain in every future version.
  jq -e '
    (.meta.schema | test("^plow-review-envelope/v[0-9]+$"))
    and .meta.provider == "gitlab"
    and (.body | type == "string")
    and (.body | contains("<!-- plow-review -->"))
    and (.comments | type == "array")
  ' "$output" > /dev/null 2>&1
}

if render_with_plow review-gitlab plow-review.json; then
  reconcile_review() {
    if plow ci reconcile-review \
      --provider gitlab \
      --mr "$CI_MERGE_REQUEST_IID" \
      --project-id "$CI_PROJECT_ID" \
      --api-url "$CI_API_V4_URL" \
      --envelope plow-review.json > plow-review-reconcile.json 2> plow-review-reconcile-stderr.log; then
      if jq -e '(.apply_errors // []) | length > 0' plow-review-reconcile.json > /dev/null 2>&1; then
        HINT=$(jq -r '.apply_hint // "refresh provider state and rerun the job"' plow-review-reconcile.json)
        echo "WARNING: plow reconcile-review apply incomplete: $HINT"
      fi
    else
      echo "WARNING: Failed to reconcile resolved review discussions"
    fi
  }

  TOTAL=$(jq '.comments | length' plow-review.json)
  if [ "$TOTAL" -eq 0 ]; then
    BODY=$(jq -r '.body' plow-review.json)
    # Summary-only path: dedup-lookup failure means we cannot find an
    # existing body note. Posting a fresh one (potential duplicate) beats
    # a missing summary, which is silently broken from the MR author's
    # view. The WARNING + sidecar artifact still surface the degradation.
    _NOTE_LOOKUP_TMP=$(mktemp); _NOTE_LOOKUP_ERR=$(mktemp)
    _PLOW_TMPS+=("$_NOTE_LOOKUP_TMP" "$_NOTE_LOOKUP_ERR")
    if curl_paginate --header "${AUTH_HEADER}" "${NOTES_URL}?per_page=100" \
         > "$_NOTE_LOOKUP_TMP" 2> "$_NOTE_LOOKUP_ERR"; then
      EXISTING_NOTE_ID=$(jq -r '.[] | select(.body | contains("<!-- plow-review -->")) | .id' "$_NOTE_LOOKUP_TMP" \
        | head -1)
    else
      EXISTING_NOTE_ID=""
      _STDERR_HEAD=$(head -3 "$_NOTE_LOOKUP_ERR" | tr '\n' ' ')
      echo "WARNING: plow: failed to look up existing MR summary note; posting a new one (may duplicate). stderr: ${_STDERR_HEAD} Re-run the job to retry. If persistent, verify GITLAB_TOKEN scopes (api, read_api)." >&2
      # Summary-only path: the post proceeds anyway, so do NOT flip
      # plow-skip-reason.txt. Mark dedup-lookup-failed instead.
      printf 'true\n' > plow-dedup-lookup-failed.txt
    fi
    if [ -n "$EXISTING_NOTE_ID" ]; then
      curl_retry \
        --header "${AUTH_HEADER}" \
        --header "Content-Type: application/json" \
        --request PUT \
        --data "$(jq -n --arg body "$BODY" '{body: $body}')" \
        "${NOTES_URL}/${EXISTING_NOTE_ID}" > /dev/null 2>&1 \
        && echo "Updated review body" \
        || echo "WARNING: Failed to update review body"
    else
      curl_retry \
        --header "${AUTH_HEADER}" \
        --header "Content-Type: application/json" \
        --request POST \
        --data "$(jq -n --arg body "$BODY" '{body: $body}')" \
        "${NOTES_URL}" > /dev/null 2>&1 \
        && echo "Posted review body" \
        || echo "WARNING: Failed to post review body"
    fi
    reconcile_review
    exit 0
  fi

  # Multi-discussion dedup path: a failed lookup here means we cannot
  # enumerate existing fingerprints, so posting any new inline discussions
  # risks N duplicate threads. Abort the post step (skip reconcile_review
  # for the same root-cause reason) and surface the failure as both a
  # stderr warning and a sidecar artifact. 4xx is a configuration error
  # and warrants a loud CI failure (exit 1); 5xx / 429 / network blips
  # warrant exit 0 since a re-run may succeed.
  _DEDUP_TMP=$(mktemp); _DEDUP_ERR=$(mktemp)
  _PLOW_TMPS+=("$_DEDUP_TMP" "$_DEDUP_ERR")
  if curl_paginate --header "${AUTH_HEADER}" "${DISCUSSIONS_URL}?per_page=100" \
       > "$_DEDUP_TMP" 2> "$_DEDUP_ERR"; then
    # Extract fingerprints from both v1 (`<!-- plow-fingerprint: <fp> -->`)
    # and v2 (`<!-- plow-fingerprint:v2: <fp> -->`) marker shapes so dedup
    # idempotency survives the issue #528 migration. v2 markers use the
    # `:v2:` namespace; the v1 substring would otherwise capture `v2:` as the
    # fingerprint instead of the actual hex string. Two sed expressions, sort
    # -u to dedupe in case a single note carries both markers (impossible by
    # construction today, defensive).
    EXISTING_FPS=$(jq -r '.[].notes[].body? // empty' "$_DEDUP_TMP" \
      | sed -n \
        -e 's/.*plow-fingerprint:v2: \([^ ]*\) .*/\1/p' \
        -e 's/.*plow-fingerprint: \([^ ]*\) .*/\1/p' \
      | sort -u \
      | jq -R -s 'split("\n") | map(select(length > 0))')
  else
    _STDERR_HEAD=$(head -3 "$_DEDUP_ERR" | tr '\n' ' ')
    echo "WARNING: plow: failed to fetch existing MR discussions; skipping inline review to avoid duplicates. stderr: ${_STDERR_HEAD} Re-run the job to retry. If persistent, verify GITLAB_TOKEN scopes (api, read_api)." >&2
    printf 'pagination_failure\n' > plow-skip-reason.txt
    printf 'true\n' > plow-dedup-lookup-failed.txt
    # 4xx (auth, scope, permission) is a configuration error: a re-run
    # will not help, so escalate to exit 1 for loud CI failure. Exclude
    # 429 explicitly: it is the rate-limited variant and is transient
    # even though curl_retry has already exhausted its budget. 5xx, 429,
    # and network errors fall through to exit 0 (re-run may help).
    # Note: ci/gitlab-ci.yml currently calls this script as
    # `bash review.sh || echo "WARNING: ..."`, which swallows exit 1.
    # Operators who want strict CI gating on 4xx should remove the
    # `|| echo` from their gitlab-ci.yml, or gate on
    # `plow-skip-reason.txt` and `plow-dedup-lookup-failed.txt`
    # in a downstream job.
    if grep -qE 'HTTP 4[0-9][0-9]|error: 4[0-9][0-9]' "$_DEDUP_ERR" \
        && ! grep -qE 'HTTP 429|error: 429|rate.limit' "$_DEDUP_ERR"; then
      exit 1
    fi
    exit 0
  fi
  jq --argjson existing "${EXISTING_FPS:-[]}" '
    .comments |= map(select((.fingerprint as $fp | $existing | index($fp)) | not))
  ' plow-review.json > plow-review-new.json
  NEW_TOTAL=$(jq '.comments | length' plow-review-new.json)
  if [ "$NEW_TOTAL" -eq 0 ]; then
    reconcile_review
    echo "No new review comments to post"
    exit 0
  fi

  BASE_SHA="${PLOW_GITLAB_BASE_SHA:-}"
  START_SHA="${PLOW_GITLAB_START_SHA:-$BASE_SHA}"
  HEAD_SHA="${PLOW_GITLAB_HEAD_SHA:-}"

  POSTED=0
  SKIPPED=0
  while IFS= read -r comment; do
    BODY_VAL=$(echo "$comment" | jq -r '.body')
    PATH_VAL=$(echo "$comment" | jq -r '.position.new_path')
    LINE_VAL=$(echo "$comment" | jq -r '.position.new_line')
    if [ -n "$BASE_SHA" ] && [ -n "$HEAD_SHA" ]; then
      PAYLOAD=$(echo "$comment" | jq --arg body "$BODY_VAL" '{body: $body, position: .position}')
      curl_retry --header "${AUTH_HEADER}" --header "Content-Type: application/json" \
        --request POST --data "$PAYLOAD" "${DISCUSSIONS_URL}" > /dev/null 2>&1 \
        && POSTED=$((POSTED + 1)) || SKIPPED=$((SKIPPED + 1))
    else
      FALLBACK_BODY=$(printf "Warning: **%s:%s**\n\n%s" "$PATH_VAL" "$LINE_VAL" "$BODY_VAL")
      curl_retry --header "${AUTH_HEADER}" --header "Content-Type: application/json" \
        --request POST --data "$(jq -n --arg body "$FALLBACK_BODY" '{body: $body}')" \
        "${NOTES_URL}" > /dev/null 2>&1 \
        && POSTED=$((POSTED + 1)) || SKIPPED=$((SKIPPED + 1))
    fi
  done < <(jq -c '.comments[]' plow-review-new.json)
  echo "Posted ${POSTED} inline comments, skipped ${SKIPPED}"
  reconcile_review
  exit 0
fi

echo "WARNING: Failed to render typed review envelope"
exit 0
