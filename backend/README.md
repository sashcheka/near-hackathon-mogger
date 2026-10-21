# Backend

C++20 service using userver v3.2. The current endpoint is `GET /health`, returning `200` and `{"status":"ok"}`. It reports that the HTTP service is running.

## Docker

Install [Docker Desktop](https://docs.docker.com/desktop/) on macOS/Windows, or [Docker Engine with the Compose plugin](https://docs.docker.com/engine/install/) on Linux. On macOS, [Colima](https://github.com/abiosoft/colima) with Docker CLI and Compose is a terminal-only alternative; start it with `colima start` first. Use Linux containers; no host C++ or Python setup is required. Run from the repository root:

```sh
docker compose up --build
```

In another terminal, check the endpoint and container status:

```sh
curl http://localhost:8080/health
docker compose ps
```

Expected response: `{"status":"ok"}`. In Windows PowerShell, use `curl.exe`.

```sh
docker compose run --rm --no-deps backend ctest --preset docker
docker compose down
```

The first command reruns the HTTP integration test in a separate container; the second stops and removes the running service. The image build also runs this test. Rebuild with `docker compose up --build` after changing code. The initial build downloads dependencies and can take several minutes.

The development image uses Ubuntu 24.04 and includes build/test tools. It builds for the host's Linux architecture rather than forcing AMD64. `configs/docker_vars.yaml` sets the container listener to `0.0.0.0`; Compose publishes port 8080 only on the host's localhost.

The Dockerfile copies shared CMake files, sources, configuration, and tests explicitly. Host build output and `CMakeUserPresets.json` are excluded. The Linux ARM64 image build, integration test, and Compose healthcheck have been verified on macOS with Colima.

## Native requirements

- A C++20 compiler, CMake 3.24+, Ninja, and Git.
- clang-format for userver's generated C++ sources.
- Python 3.10+ for the pytest-based integration test; the local preset uses Python 3.12.
- [userver build dependencies](https://userver.tech/de/dab/md_en_2userver_2build_2build.html) for your platform.

## Native build and test

Run from the repository root:

```sh
cd backend
cmake --preset default
cmake --build --preset default
ctest --preset default
```

Configuration fetches the pinned userver source and resolves its dependencies. The first build can take several minutes. CTest starts the service and checks the health response through HTTP.

## Native run

From `backend/`:

```sh
./build/community_treasury_backend --config configs/static_config.yaml
```

In another terminal:

```sh
curl -i http://127.0.0.1:8080/health
```

Stop the service with `Ctrl+C`. The listener binds to localhost; its port and logging settings are defined in `configs/static_config.yaml`.

## Files

| File | Purpose |
| --- | --- |
| `src/main.cpp` | Health handler registration and service startup |
| `configs/static_config.yaml` | Task processors, HTTP listener, route, and logging |
| `CMakeLists.txt` | Dependency version, executable, and test registration |
| `CMakePresets.json` | Shared configure, build, and test settings |
| `tests/` | HTTP integration test using userver's pytest fixtures |
| `Dockerfile` | Linux development image with build tools and the service |
| `configs/docker_vars.yaml` | Listener address override for the container |

Keep machine-specific compiler or dependency paths in an ignored `CMakeUserPresets.json`. Keep request handling, application rules, and external integrations separate as features are added.

On the configured development Mac, the ignored `macos-local` preset supplies Homebrew dependency and Python paths:

```sh
cmake --preset macos-local
cmake --build --preset macos-local
ctest --preset macos-local
```
