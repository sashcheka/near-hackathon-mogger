# Backend

C++20 service using userver v3.2. `GET /health` returns HTTP 200 and `{"status":"ok"}`.

## Run

Install Docker with Compose. On macOS, use Docker Desktop or [Colima](https://github.com/abiosoft/colima) with Docker CLI and Compose. With Colima, run `colima start` first. No host C++ or Python setup is required.

Run from the repository root after each code change:

```sh
docker compose up --build -d --wait
```

The image build compiles the service and runs its HTTP integration test. The first build downloads dependencies and can take several minutes. Source changes require a rebuild.

## Check

```sh
curl -i http://localhost:8080/health
docker compose ps
docker compose logs --tail=100 backend
```

Expected: HTTP 200, `{"status":"ok"}`, and a healthy container. In Windows PowerShell, use `curl.exe`.

Rerun the integration test in a temporary container:

```sh
docker compose run --rm --no-deps backend ctest --preset docker
```

## Stop

```sh
docker compose stop
```

With Colima, then run `colima stop` to stop the VM. Containers, images, and build cache are preserved. Use `docker compose down` to remove the project containers and network instead.

## VS Code development

Use the Dev Containers extension so CMake and C++ IntelliSense can access the Linux compiler and userver headers. Configuring CMake directly on the host requires a separate native toolchain.

From a host terminal in the repository root, start Colima if needed and prepare the image:

```sh
colima start
docker compose build backend
docker compose stop
```

Install `ms-vscode-remote.remote-containers` in VS Code and open the repository root. Run **Dev Containers: Reopen in Container**, then **CMake: Select Configure Preset** and choose `docker`, then **CMake: Configure**. The C++ and CMake Tools extensions are installed inside the development container.

In the VS Code container terminal:

```sh
cd /app/backend
cmake --preset docker
cmake --build --preset docker
ctest --preset docker
./build/community_treasury_backend --config configs/static_config.yaml
```

The server runs in the foreground; stop it with `Ctrl+C`. VS Code forwards port 8080. After source changes, rebuild and restart the binary. Source edits are saved directly to the host repository. Build output and fetched dependencies stay in a named Docker volume initialized from the image's build directory.

The development container uses the existing `near-hackathon-mogger-backend:latest` image. After changing image dependencies, rerun `docker compose build backend` on the host and **Dev Containers: Rebuild Container**. Changes to CMake settings or dependency versions may also require reconfiguration of the persistent build directory. Close the remote connection to stop the development container, then run `colima stop` on the host if desired.

## Configuration

The development image uses Ubuntu 24.04 with build/test tools. The server listens on `0.0.0.0` inside the container; Compose publishes port 8080 only on the host's localhost. Host build output and local CMake presets are excluded from the image.

| File | Purpose |
| --- | --- |
| `src/main.cpp` | Health handler and service startup |
| `configs/static_config.yaml` | Worker threads, HTTP listener, route, and logging |
| `CMakeLists.txt` | userver dependency, executable, and test registration |
| `CMakePresets.json` | One `docker` preset for configure, build, and test |
| `Dockerfile` | Linux environment, image build, and startup command |
| `../compose.yaml` | Container startup, localhost port, and healthcheck |
| `../.devcontainer/devcontainer.json` | VS Code container environment and persistent Linux build volume |
| `tests/` | HTTP integration test |
