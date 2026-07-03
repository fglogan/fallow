FROM debian:bookworm-slim AS download

ARG PLOW_VERSION=2.94.0
ARG TARGETARCH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) \
      asset="plow-linux-x64-musl"; \
      sha256="e70fce061dbae33cb2ff1b651a13c4dcc6bb09bb3abf8df004e639287aba425f"; \
      ;; \
    arm64) \
      asset="plow-linux-arm64-musl"; \
      sha256="d7d0007b7edf01c73e1e1227df1cc5234faeff92bc8f0bb31cfc6c87560fe02b"; \
      ;; \
    *) \
      echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; \
      exit 1; \
      ;; \
  esac; \
  curl -fsSL "https://github.com/fglogan/genesis-plow/releases/download/v${PLOW_VERSION}/${asset}" -o /usr/local/bin/plow; \
  echo "${sha256}  /usr/local/bin/plow" | sha256sum -c -; \
  chmod +x /usr/local/bin/plow

FROM node:26-bookworm-slim AS runtime

ARG COREPACK_VERSION=0.35.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && npm install -g "corepack@${COREPACK_VERSION}" \
  && corepack enable \
  && npm cache clean --force \
  && rm -rf /var/lib/apt/lists/*

COPY --from=download /usr/local/bin/plow /usr/local/bin/plow

WORKDIR /workspace
ENTRYPOINT ["plow"]
CMD ["--help"]
