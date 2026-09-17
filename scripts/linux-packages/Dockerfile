FROM rust:1.96.1-slim-bookworm@sha256:e18a79fc84dfcfc3ab5ba72290398a644c135c97eaa881447fddc354ee4701a3 AS rust
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS bun
FROM ubuntu:22.04@sha256:829f6df217bcbae2b371026e81711d1a787c61b2967ad09d015063663ebafbf7
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=rust /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
# Immutable archive date plus signed APT metadata; no host package installation.
RUN printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/20260917T000000Z/ jammy main universe\ndeb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/20260917T000000Z/ jammy-updates main universe\ndeb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/20260917T000000Z/ jammy-security main universe\n' > /etc/apt/sources.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev libssl-dev patchelf file curl git rpm jq desktop-file-utils \
 && rm -rf /var/lib/apt/lists/*
COPY --from=rust /usr/local/rustup /usr/local/rustup
COPY --from=rust /usr/local/cargo /usr/local/cargo
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:/usr/local/bin:/usr/bin:/bin
RUN rustc --version && cargo --version && bun --version && pkg-config --modversion gtk+-3.0 webkit2gtk-4.1
WORKDIR /workspace
