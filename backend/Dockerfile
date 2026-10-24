FROM ubuntu:24.04

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        build-essential ca-certificates clang-format cmake curl git \
        libboost-atomic-dev libboost-context-dev libboost-coroutine-dev \
        libboost-filesystem-dev libboost-iostreams-dev libboost-locale-dev \
        libboost-program-options-dev libboost-regex-dev libboost-stacktrace-dev \
        libbz2-dev libc-ares-dev libcctz-dev libcrypto++-dev \
        libcurl4-openssl-dev libev-dev libfmt-dev libicu-dev libjemalloc-dev \
        libnghttp2-dev libpq-dev libre2-dev libssl-dev liburing-dev libyaml-cpp-dev \
        libzstd-dev locales ninja-build postgresql-16 python3-dev python3-venv zlib1g-dev \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/amacneil/dbmate:2.37.0 /usr/local/bin/dbmate /usr/local/bin/dbmate

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/backend \
    && chown app:app /app/backend

USER app
WORKDIR /app/backend
COPY --chown=app:app backend/CMakeLists.txt backend/CMakePresets.json ./
COPY --chown=app:app backend/src/ ./src/
COPY --chown=app:app backend/configs/ ./configs/
COPY --chown=app:app backend/tests/ ./tests/
COPY --chown=app:app backend/db/ ./db/

RUN cmake --preset docker \
    && cmake --build --preset docker \
    && ctest --preset docker

# Initialize the Codex volume with ownership matching the development user.
RUN install -d -m 0700 /home/app/.codex

EXPOSE 8080
CMD ["./build/community_treasury_backend", "--config", "configs/static_config.yaml"]
