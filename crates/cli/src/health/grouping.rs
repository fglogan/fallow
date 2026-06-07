//! Per-group health computation for `--group-by`.
//!
//! Partitions the project's analyzed files by an [`OwnershipResolver`] and
//! produces a [`HealthGroup`] for each bucket. Each group computes its own
//! `VitalSigns` / `HealthScore` from the files in that group, mirroring
//! how `--workspace` already scopes a single subset (`SubsetFilter::Paths`
//! is the underlying primitive in both cases).

use std::path::{Path, PathBuf};

use rustc_hash::{FxHashMap, FxHashSet};

use super::scoring::FileScoreOutput;
use super::{
    SubsetFilter, VitalSignsAndCountsInput, apply_duplication_metrics,
    compute_vital_signs_and_counts,
};
use crate::health_types::{
    ComplexityViolation, FileHealthScore, HealthGroup, HealthGrouping, HotspotEntry,
    LargeFunctionEntry, RefactoringTarget, summarize_coverage_source_consistency,
};
use crate::report::OwnershipResolver;
use crate::vital_signs;

/// Bucket of file paths sharing a resolver key.
struct GroupBucket {
    key: String,
    owners: Option<Vec<String>>,
    paths: FxHashSet<PathBuf>,
}

pub(super) struct HealthGroupingInput<'a> {
    pub files: &'a [fallow_types::discover::DiscoveredFile],
    pub modules: &'a [fallow_core::extract::ModuleInfo],
    pub file_paths: &'a FxHashMap<fallow_core::discover::FileId, &'a PathBuf>,
    pub score_output: Option<&'a FileScoreOutput>,
    pub file_scores: &'a [FileHealthScore],
    pub findings: &'a [ComplexityViolation],
    pub hotspots: &'a [HotspotEntry],
    pub large_functions: &'a [LargeFunctionEntry],
    pub targets: &'a [RefactoringTarget],
    pub score_requested: bool,
    pub duplicates_config: Option<&'a fallow_config::DuplicatesConfig>,
    pub needs_file_scores: bool,
    pub needs_hotspots: bool,
    pub show_vital_signs: bool,
    pub action_ctx: &'a crate::health_types::HealthActionContext,
}

/// Build [`HealthGrouping`] for the resolved `--group-by` mode.
///
/// `candidate_paths` is the set of files that already passed
/// workspace / changed-since / ignore filters, that is, the files that
/// contribute to the project-level report. Anything outside this set is
/// dropped before resolution so groups never include files the user has
/// excluded from the run.
pub(super) fn build_health_grouping(
    resolver: &OwnershipResolver,
    project_root: &Path,
    candidate_paths: &FxHashSet<PathBuf>,
    input: &HealthGroupingInput<'_>,
) -> HealthGrouping {
    let buckets = bucket_paths(resolver, project_root, candidate_paths);

    let groups: Vec<HealthGroup> = buckets
        .into_iter()
        .map(|bucket| build_group(bucket, project_root, input))
        .collect();

    HealthGrouping {
        mode: resolver.mode_label(),
        groups,
    }
}

/// Bucket every candidate path by the resolver key.
///
/// Output is sorted by descending file count with the unowned bucket pushed
/// last (matches the `dead-code` grouped output's ordering convention so that
/// human / JSON consumers see the same row ordering across analyses).
fn bucket_paths(
    resolver: &OwnershipResolver,
    project_root: &Path,
    candidate_paths: &FxHashSet<PathBuf>,
) -> Vec<GroupBucket> {
    let mut by_key: FxHashMap<String, GroupBucket> = FxHashMap::default();
    for path in candidate_paths {
        let rel = path.strip_prefix(project_root).unwrap_or(path);
        let (key, _rule) = resolver.resolve_with_rule(rel);
        let entry = by_key.entry(key.clone()).or_insert_with(|| GroupBucket {
            key: key.clone(),
            owners: resolver.section_owners_of(rel).map(<[_]>::to_vec),
            paths: FxHashSet::default(),
        });
        entry.paths.insert(path.clone());
    }
    let mut out: Vec<GroupBucket> = by_key.into_values().collect();
    out.sort_by(|a, b| {
        let unowned_a = is_unowned_label(&a.key);
        let unowned_b = is_unowned_label(&b.key);
        match (unowned_a, unowned_b) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => b.paths.len().cmp(&a.paths.len()).then(a.key.cmp(&b.key)),
        }
    });
    out
}

fn is_unowned_label(key: &str) -> bool {
    key == crate::codeowners::UNOWNED_LABEL
}

fn build_group(
    bucket: GroupBucket,
    project_root: &Path,
    input: &HealthGroupingInput<'_>,
) -> HealthGroup {
    let GroupBucket { key, owners, paths } = bucket;
    let subset = SubsetFilter::Paths(&paths);

    let group_findings: Vec<ComplexityViolation> = input
        .findings
        .iter()
        .filter(|f| paths.contains(&f.path))
        .cloned()
        .collect();
    let group_file_scores: Vec<FileHealthScore> = input
        .file_scores
        .iter()
        .filter(|s| paths.contains(&s.path))
        .cloned()
        .collect();
    let group_hotspots: Vec<HotspotEntry> = input
        .hotspots
        .iter()
        .filter(|h| paths.contains(&h.path))
        .cloned()
        .collect();
    let group_large_functions: Vec<LargeFunctionEntry> = input
        .large_functions
        .iter()
        .filter(|l| paths.contains(&l.path))
        .cloned()
        .collect();
    let total_files = paths.len();
    let vital_signs_input = VitalSignsAndCountsInput {
        score_output: input.score_output,
        modules: input.modules,
        file_paths: input.file_paths,
        needs_file_scores: input.needs_file_scores,
        file_scores_slice: &group_file_scores,
        needs_hotspots: input.needs_hotspots,
        hotspots: &group_hotspots,
        total_files,
        subset: &subset,
    };
    let (mut vital_signs, mut counts) = compute_vital_signs_and_counts(&vital_signs_input);
    if let Some(config) = input.duplicates_config {
        let group_files: Vec<fallow_types::discover::DiscoveredFile> = input
            .files
            .iter()
            .filter(|file| paths.contains(&file.path))
            .cloned()
            .collect();
        let dupes_report =
            fallow_core::duplicates::find_duplicates(project_root, &group_files, config);
        apply_duplication_metrics(&mut vital_signs, &mut counts, &dupes_report);
    }
    let health_score = input
        .score_requested
        .then(|| vital_signs::compute_health_score(&vital_signs, total_files));

    let functions_above_threshold = group_findings.len();
    let coverage_source_consistency = summarize_coverage_source_consistency(
        group_findings
            .iter()
            .filter_map(|finding| finding.coverage_source),
    );
    let wrapped_findings: Vec<crate::health_types::HealthFinding> = group_findings
        .into_iter()
        .map(|v| crate::health_types::HealthFinding::with_actions(v, input.action_ctx))
        .collect();
    let wrapped_hotspots: Vec<crate::health_types::HotspotFinding> = group_hotspots
        .into_iter()
        .map(|h| crate::health_types::HotspotFinding::with_actions(h, project_root))
        .collect();
    let wrapped_targets: Vec<crate::health_types::RefactoringTargetFinding> = input
        .targets
        .iter()
        .filter(|t| paths.contains(&t.path))
        .cloned()
        .map(crate::health_types::RefactoringTargetFinding::with_actions)
        .collect();

    HealthGroup {
        key,
        owners,
        files_analyzed: total_files,
        functions_above_threshold,
        coverage_source_consistency,
        vital_signs: input.show_vital_signs.then_some(vital_signs),
        health_score,
        findings: wrapped_findings,
        file_scores: group_file_scores,
        hotspots: wrapped_hotspots,
        large_functions: group_large_functions,
        targets: wrapped_targets,
        actions_meta: if input.action_ctx.opts.omit_suppress_line {
            Some(crate::health_types::HealthActionsMeta {
                suppression_hints_omitted: true,
                reason: input
                    .action_ctx
                    .opts
                    .omit_reason
                    .unwrap_or("unspecified")
                    .to_string(),
                scope: "health-findings".to_string(),
            })
        } else {
            None
        },
    }
}
