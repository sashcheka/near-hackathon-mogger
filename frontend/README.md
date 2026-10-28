# Frontend

React + TypeScript purchase screen, built with Vite. Enter a request and a budget in test NEAR, then review the selected product, quantity, price, and unpaid order. Model and budget errors appear in the form. Wallet payments are pending.

## Development

The dev image includes Node.js 24 and npm. After pulling the environment change, run **Dev Containers: Rebuild Container** once. Existing backend build, extensions, and Codex volumes are reused. Keep PostgreSQL running on the host and restart the backend inside the dev container with Ollama configured; see [model setup](../docs/OLLAMA.md).

In a dev container terminal, reuse the existing backend binary:

```sh
cd /app/backend
OLLAMA_MODEL=qwen3:4b \
OLLAMA_CHAT_URL=http://host.lima.internal:11434/api/chat \
  ./build/community_treasury_backend --config configs/static_config.yaml
```

In another dev container terminal:

```sh
cd /app/frontend
npm ci
npm test
npm run build
npm run dev
```

Open `http://localhost:5173` using VS Code's forwarded port. Vite proxies `/api` to `http://127.0.0.1:8080` inside the same container. The production bundle needs a reverse proxy with the same `/api` mapping; Vite's proxy is development-only.

Budget input and display use decimal strings without floating-point conversion. The backend remains authoritative for product prices and budget checks. Submitting creates an unpaid order; there are no automatic retries. The user must review model choices before payment.

Check a normal request, an over-budget purchase, an unavailable product, and a stopped Ollama server. Currency conversion tests and a production build are provided; browser and live backend verification are pending.
