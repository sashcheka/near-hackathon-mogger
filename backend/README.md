# Backend

C++20 service using userver v3.2 with a PostgreSQL connection pool. `GET /health` reports HTTP liveness, `GET /products` reads the catalog, and `POST /orders` validates and stores unpaid orders. Schema migrations are in `db/migrations/`; optional demo data is in `db/seed.sql`.

## Run

Install Docker with Compose. On macOS, use Docker Desktop or [Colima](https://github.com/abiosoft/colima) with Docker CLI and Compose. With Colima, run `colima start` first. No host C++ or Python setup is required.

Run Docker commands on the host from the repository root. Prepare the database on first setup and after adding migrations:

```sh
docker compose up -d --wait postgres
docker compose run --rm migrate
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U treasury -d treasury < backend/db/seed.sql
docker compose up --build -d --wait backend
```

The seed command is optional and preserves existing product rows. After code-only changes, repeat just the last command. The image build compiles the service and runs tests against a temporary PostgreSQL instance using the same dbmate migrations. Tests do not use the persistent Compose database. The first build can take several minutes.

## Check

```sh
curl -i http://localhost:8080/health
curl -i http://localhost:8080/products
docker compose ps
docker compose logs --tail=100 backend
docker compose exec postgres psql -U treasury -d treasury -c "SELECT id, name, price_yocto FROM products ORDER BY id;"
```

Expected: HTTP 200, `{"status":"ok"}` from `/health`, a catalog response from `/products`, and a healthy container. In Windows PowerShell, use `curl.exe`.

Rerun the tests in a temporary container:

```sh
docker compose run --rm --no-deps backend ctest --preset docker
```

## Catalog API

`GET /products` returns `{"products": [...]}` with products ordered by `id`. Each entry contains `id`, `name`, and `price_yocto`. Prices are decimal integer strings to preserve precision in JavaScript. An empty catalog returns HTTP 200 and `{"products": []}`.

```json
{"products":[{"id":"toilet-paper","name":"Toilet paper","price_yocto":"2000000000000000000000000"}]}
```

The example shows one product; the seeded catalog has three. The handler queries PostgreSQL on each request; database failures produce an error response rather than an empty catalog. HTTP tests cover the seeded catalog, an empty table, and updated database values including a 39-digit price.

## Orders API

`POST /orders` accepts exactly these fields:

```json
{"product_id":"toilet-paper","quantity":1,"budget_yocto":"3000000000000000000000000"}
```

Quantity must be an integer from 1 to 1000. Budget must be a positive decimal integer string, at most 39 digits, without leading zeros. The budget limits this order only; it does not reserve wallet funds or enforce a shared spending allowance.

HTTP 201 returns `id` (UUID), `product_id`, `quantity`, `unit_price_yocto`, `total_yocto`, `budget_yocto`, and `status: pending_payment`. Prices come from the database; monetary fields are strings. A shared row lock keeps the catalog price stable until the order snapshot is committed. Amount calculations use exact 256-bit integers; database constraints also enforce the total and budget.

Errors use `{"error":"code"}`: HTTP 400 `invalid_request`, 404 `product_not_found`, or 409 `budget_exceeded`. Rejected requests create no order. Database failures remain server errors. Each successful POST creates a new unpaid order; this endpoint does not call AI or transfer funds.

```sh
curl -i http://localhost:8080/orders \
  -H 'Content-Type: application/json' \
  -d '{"product_id":"toilet-paper","quantity":1,"budget_yocto":"3000000000000000000000000"}'
```

Code flow: `handlers/orders_handler` parses HTTP/JSON, `services/orders_service` validates and controls the transaction, `repositories/orders_repository` executes parameterized SQL, and `domain/order.hpp` defines shared types. Integration tests cover persisted snapshots, rejected requests, and large exact amounts. Direct order creation is verified; test execution has not been confirmed.

## AI purchase requests

`POST /purchase-requests` accepts `prompt` and `budget_yocto`, selects a product through local Ollama, and uses the existing order service to create an unpaid order. See [local model setup](../docs/OLLAMA.md) for installation, configuration, API errors, and verification commands. Runtime validation is pending.

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
docker compose run --rm migrate
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U treasury -d treasury < backend/db/seed.sql
docker compose build backend
docker compose stop backend
```

Install `ms-vscode-remote.remote-containers` in VS Code and open the repository root. Run **Dev Containers: Reopen in Container**, then **CMake: Select Configure Preset** and choose **Debug backend** (the `docker` preset), then **CMake: Configure**. If the dev container already exists, use **Dev Containers: Rebuild Container** after preparing the updated image. The C++ and CMake Tools extensions are installed inside the development container.

PostgreSQL must be started first: it creates the `near-hackathon-mogger_default` Docker network that the development container joins. Both the Compose backend and dev container reach the database at `postgres:5432`. Run Docker/Compose commands on the host; Docker CLI is not installed in the dev container.

The image includes dbmate 2.37.0. If you keep the current dev container instead of rebuilding it, install just this tool from the pinned image. Run on the host, replacing `priceless_liskov` with your dev container name if different:

```sh
dbmate_copy_container=$(docker create ghcr.io/amacneil/dbmate:2.37.0)
docker cp "$dbmate_copy_container":/usr/local/bin/dbmate - | docker exec -i -u root priceless_liskov tar -x -C /usr/local/bin
docker rm "$dbmate_copy_container"
```

This copies the executable without replacing the dev container or its Codex history. In the VS Code container terminal:

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

Prices are exact integer yoctoNEAR values stored as `NUMERIC(39, 0)`, since even one NEAR exceeds a 64-bit integer in yoctoNEAR. These are Testnet prices, not dollar amounts.

## Migrations

[dbmate](https://github.com/amacneil/dbmate) 2.37.0 runs as a temporary Compose service under the `tools` profile. `docker compose run` activates that service explicitly. PostgreSQL only creates the database and user; it no longer runs an application schema initialization script.

Host commands from the repository root:

```sh
docker compose run --rm migrate
docker compose run --rm migrate status
docker compose run --rm --user "$(id -u):$(id -g)" migrate new create_orders
```

Each migration has `-- migrate:up` and `-- migrate:down` sections. dbmate records applied versions in `schema_migrations`. Add new files rather than editing applied migrations. Demo data stays separate in `db/seed.sql`; migrations never seed it.

The first migration uses `CREATE TABLE IF NOT EXISTS` to adopt the matching `products` table from our previous setup. It preserves existing rows and records the version; it does not reconcile arbitrary schema differences. Keep the existing PostgreSQL volume. Rolling back this initial migration drops `products` and its data.

Tests apply migrations before discovering tables, keep the version table between tests, and restore only demo rows per test. A regression test simulates adoption of the previous catalog and verifies that repeated migration runs preserve its data. The schema is verified through direct order creation; the expanded test suite awaits confirmation.

## Configuration

The development image uses Ubuntu 24.04 with build/test tools. The server listens on `0.0.0.0` inside the container; Compose publishes port 8080 only on the host's localhost. Host build output and local CMake presets are excluded from the image.

| File | Purpose |
| --- | --- |
| `src/main.cpp` | Health handler, DNS resolver, and PostgreSQL component registration |
| `src/handlers/products_handler.hpp` | Catalog handler declaration and PostgreSQL cluster dependency |
| `src/handlers/products_handler.cpp` | Catalog JSON response serialization |
| `src/handlers/orders_handler.*` | Order request parsing, response serialization, and error mapping |
| `src/services/orders_service.*` | Purchase validation and transaction boundary |
| `src/repositories/orders_repository.*` | Catalog locking and parameterized order insertion |
| `src/domain/order.hpp` | Order request, result, and error types |
| `src/handlers/purchase_handler.*` | AI purchase HTTP interface and configuration |
| `src/services/purchase_service.*` | Model selection followed by order validation |
| `src/clients/ollama_client.*` | Local model HTTP protocol and response checks |
| `src/repositories/products_repository.*` | Shared catalog SELECT and typed row mapping |
| `configs/static_config.yaml` | Worker threads, HTTP listener, route, and logging |
| `CMakeLists.txt` | userver dependency, executable, and test registration |
| `CMakePresets.json` | One `docker` preset for configure, build, and test |
| `Dockerfile` | Linux environment, image build, and startup command |
| `../compose.yaml` | Container startup, localhost port, and healthcheck |
| `db/migrations/` | Versioned schema changes applied by dbmate |
| `db/seed.sql` | Optional, repeatable demo catalog insertion |
| `../.devcontainer/devcontainer.json` | VS Code container environment and persistent Linux build volume |
| `tests/` | HTTP integration test |
