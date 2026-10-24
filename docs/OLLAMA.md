# Local model setup

The backend calls Ollama's native `/api/chat` endpoint. No API key or paid provider is required. Start with [qwen3:1.7b](https://ollama.com/library/qwen3:1.7b), a 1.4 GB download; runtime memory usage is higher. Its selection quality must be checked on the demo requests.

## macOS with Colima

Install and start Ollama in a Mac terminal:

```sh
brew install ollama
ollama serve
```

Leave that terminal running. In another Mac terminal:

```sh
ollama pull qwen3:1.7b
```

Run Ollama on the Mac to use the native runtime rather than CPU inference inside the Linux VM. It listens on localhost by default. With Colima/Lima, check access from the dev container before starting the backend:

```sh
curl --fail http://host.lima.internal:11434/api/tags
```

Then, in the dev container, stop the old backend and run:

```sh
cd /app/backend
cmake --preset docker
cmake --build --preset docker
ctest --preset docker
OLLAMA_CHAT_URL=http://host.lima.internal:11434/api/chat \
  ./build/community_treasury_backend --config configs/static_config.yaml
```

`OLLAMA_MODEL` overrides the default `qwen3:1.7b`. `OLLAMA_CHAT_URL` is the full chat endpoint, not a base URL. An empty URL disables model requests with HTTP 503 while the other endpoints remain available. For a native backend on the host, use `http://localhost:11434/api/chat`; Docker Desktop uses `host.docker.internal`. Compose backend users must explicitly pass these variables into that container.

Backend logging defaults to warnings and errors. To see `Model selected product_id=... quantity=...` and framework diagnostics, add `LOG_LEVEL=info` before the backend launch command.

## Request

From another terminal:

```sh
curl -i http://localhost:8080/purchase-requests \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Buy one pack of toilet paper","budget_yocto":"3000000000000000000000000"}'
```

The endpoint accepts exactly `prompt` and `budget_yocto`. Prompt length is 1–2000 UTF-8 bytes and cannot consist only of spaces, tabs, or line breaks. Budget follows the `/orders` amount format. A successful request returns HTTP 201 with the same unpaid order representation as `POST /orders`.

The model receives product IDs and names. Its instructions prefer standard products for generic requests and upgraded variants only when explicitly requested. This is a model instruction, not a deterministic guarantee. It returns only an ID and quantity under a [JSON schema](https://docs.ollama.com/capabilities/structured-outputs). The client validates the response independently; the order service rereads the current price and checks the budget in its own transaction. No transaction is held during inference. The model cannot set a price or authorize a payment. A valid selection can still misunderstand the user's intent; the user must review the order before paying.

Errors: 400 `invalid_request`, 404 `no_matching_product` or `product_not_found` if a selected product was deleted, 409 `budget_exceeded`, 502 `invalid_model_response`, 503 `model_unavailable`, and 504 `model_timeout`. Model failure creates no order; there is no automatic fallback selection. Requests have a 60-second model timeout, one attempt, no redirects, a 2048-token context, and at most 128 generated tokens. Thinking and streaming are disabled.

Integration tests use an HTTP mock server; they need neither Ollama nor downloaded weights. They cover saved orders, invalid selections, budget rejection, upstream errors, and timeouts. The original four real-model scenarios passed with `qwen3:1.7b`. The expanded catalog checks and updated test-suite execution await verification.

The seed now contains 18 products. Apply the added demo rows from a host terminal in the repository root; existing products and orders are preserved:

```sh
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U treasury -d treasury < backend/db/seed.sql
```

No schema migration, C++ rebuild, or backend restart is needed. To check actual model behavior, run in a second dev container terminal with the backend and Ollama running:

```sh
python3 /app/backend/scripts/check_model_selection.py
```

The script checks 20 requests against the full catalog, verifies the necessary products are present, and reports expected and actual choices on failures. Successful requests create unpaid demo orders. It returns a nonzero exit status on failure. The model prompt is unchanged for these new cases.

| Selection dimension | Examples |
| --- | --- |
| Milk and plant-based drinks | Whole cow milk, lactose-free cow milk, oat drink, almond drink |
| Coffee preparation and caffeine | Whole beans, caffeinated ground, decaffeinated ground |
| Tea | Green vs. black; two boxes |
| Cleaning use | Washing dishes by hand vs. clothes in a machine |
| Water | Sparkling vs. still; three bottles |
| Bread | Whole wheat vs. gluten-free |
| Unavailable items | Laptop and soy milk: return no match |

The original paper scenarios remain as regressions. All prices and budgets are test NEAR values. Unlike mocked HTTP tests, these checks measure real model choices on a small fixed sample; they do not establish general accuracy.

## Stop

On the Mac, `ollama stop qwen3:1.7b` unloads the model. `Ctrl+C` in the `ollama serve` terminal stops the server. Requests keep the model loaded for one minute of inactivity. No login service is installed by these instructions.
