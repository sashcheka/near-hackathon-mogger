# Backend

C++20 service using userver v3.2 with a PostgreSQL connection pool. `GET /health` returns HTTP 200 and `{"status":"ok"}`; it reports HTTP liveness, not ongoing database availability. The product schema and seed data are in `db/treasury.sql`; the catalog API is the next step.

## Run

Install Docker with Compose. On macOS, use Docker Desktop or [Colima](https://github.com/abiosoft/colima) with Docker CLI and Compose. With Colima, run `colima start` first. No host C++ or Python setup is required.

Run from the repository root after each code change:

```sh
docker compose up --build -d --wait
```

Compose starts PostgreSQL before the backend. The image build compiles the service and runs tests against a temporary PostgreSQL instance inside the build container. Tests do not use the persistent Compose database. The first build downloads dependencies and can take several minutes. Source changes require a rebuild.

## Check

```sh
curl -i http://localhost:8080/health
docker compose ps
docker compose logs --tail=100 backend
docker compose exec postgres psql -U treasury -d treasury -c "SELECT id, name, price_yocto FROM products ORDER BY id;"
```

Expected: HTTP 200, `{"status":"ok"}`, and a healthy container. In Windows PowerShell, use `curl.exe`.

Rerun the tests in a temporary container:

```sh
docker compose run --rm --no-deps backend ctest --preset docker
```

## Stop

```sh
docker compose stop
```

With Colima, then run `colima stop` to stop the VM. Containers, images, build cache, and database data are preserved. Use `docker compose down` to remove the project containers and network instead; it keeps the database volume.

## VS Code development

Use the Dev Containers extension so CMake and C++ IntelliSense can access the Linux compiler and userver headers. Configuring CMake directly on the host requires a separate native toolchain.

From a host terminal in the repository root, start Colima if needed and prepare the image:

```sh
colima start
docker compose up -d --wait postgres
docker compose build backend
docker compose stop backend
```

Install `ms-vscode-remote.remote-containers` in VS Code and open the repository root. Run **Dev Containers: Reopen in Container**, then **CMake: Select Configure Preset** and choose **Debug backend** (the `docker` preset), then **CMake: Configure**. If the dev container already exists, use **Dev Containers: Rebuild Container** after preparing the updated image. The C++ and CMake Tools extensions are installed inside the development container.

PostgreSQL must be started first: it creates the `near-hackathon-mogger_default` Docker network that the development container joins. Both the Compose backend and dev container reach the database at `postgres:5432`. Run Docker/Compose commands on the host; Docker CLI is not installed in the dev container.

In the VS Code container terminal:

```sh
cd /app/backend
cmake --preset docker
cmake --build --preset docker
ctest --preset docker
./build/community_treasury_backend --config configs/static_config.yaml
```

The server runs in the foreground; stop it with `Ctrl+C`. VS Code forwards port 8080. After source changes, rebuild and restart the binary. Source edits are saved directly to the host repository. Build output and fetched dependencies stay in a named Docker volume initialized from the image's build directory.

The development container uses the existing `near-hackathon-mogger-backend:latest` image. After changing image dependencies, rerun `docker compose build backend` on the host and **Dev Containers: Rebuild Container**. Changes to CMake settings or dependency versions may also require reconfiguration of the persistent build directory. Close the remote connection to stop the development container, then run `docker compose stop postgres` and `colima stop` on the host if desired. Rebuilding the dev container replaces its writable filesystem; data outside mounted folders or volumes is not preserved.

## PostgreSQL

Compose uses PostgreSQL 16 with a named `postgres-data` volume and no published database port. The database/user are `treasury`; `local-dev-only` is a development password. The userver configuration accepts an optional `POSTGRES_DSN` environment variable and otherwise uses these local Compose credentials. It uses the system libpq library without optional userver portal patches.

`db/treasury.sql` creates `products` and three demo products. Prices are exact integer yoctoNEAR values stored as `NUMERIC(39, 0)`, since even one NEAR exceeds a 64-bit integer in yoctoNEAR. These are Testnet prices, not dollar amounts.

PostgreSQL runs the initialization script only when the data volume is empty. Later schema changes need an explicit migration; editing this file does not update an existing database automatically. To apply this initial script to an existing local database without deleting its data:

```sh
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U treasury -d treasury < backend/db/treasury.sql
```

The script preserves existing product rows. Tests check seeded prices and reject non-positive prices. Database integration has not yet been built or run after this change.

## Configuration

The development image uses Ubuntu 24.04 with build/test tools. The server listens on `0.0.0.0` inside the container; Compose publishes port 8080 only on the host's localhost. Host build output and local CMake presets are excluded from the image.

| File | Purpose |
| --- | --- |
| `src/main.cpp` | Health handler, DNS resolver, and PostgreSQL component registration |
| `configs/static_config.yaml` | Worker threads, HTTP listener, route, and logging |
| `CMakeLists.txt` | userver dependency, executable, and test registration |
| `CMakePresets.json` | One `docker` preset for configure, build, and test |
| `Dockerfile` | Linux environment, image build, and startup command |
| `../compose.yaml` | Container startup, localhost port, and healthcheck |
| `db/treasury.sql` | Initial product schema and demo prices |
| `../.devcontainer/devcontainer.json` | VS Code container environment and persistent Linux build volume |
| `tests/` | HTTP integration test |
