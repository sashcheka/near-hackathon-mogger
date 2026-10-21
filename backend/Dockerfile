FROM ubuntu:24.04

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        build-essential ca-certificates clang-format cmake curl git \
        libboost-atomic-dev libboost-context-dev libboost-coroutine-dev \
        libboost-filesystem-dev libboost-iostreams-dev libboost-locale-dev \
        libboost-program-options-dev libboost-regex-dev libboost-stacktrace-dev \
        libbz2-dev libc-ares-dev libcctz-dev libcrypto++-dev \
        libcurl4-openssl-dev libev-dev libfmt-dev libicu-dev libjemalloc-dev \
        libnghttp2-dev libre2-dev libssl-dev liburing-dev libyaml-cpp-dev \
        libzstd-dev ninja-build python3-dev python3-venv zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/backend \
    && chown app:app /app/backend

USER app
WORKDIR /app/backend
COPY --chown=app:app backend/CMakeLists.txt backend/CMakePresets.json ./
COPY --chown=app:app backend/src/ ./src/
COPY --chown=app:app backend/configs/ ./configs/
COPY --chown=app:app backend/tests/ ./tests/

RUN cmake --preset docker \
    && cmake --build --preset docker \
    && ctest --preset docker

EXPOSE 8080
CMD ["./build/community_treasury_backend", "--config", "configs/static_config.yaml", "--config_vars", "configs/docker_vars.yaml"]
