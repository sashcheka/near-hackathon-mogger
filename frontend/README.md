# Frontend

React + TypeScript purchase screen, built with Vite. Enter a request and a budget in test NEAR, then review the selected product, quantity, price, and unpaid order. Model and budget errors appear in the form. Wallet payments are pending.

After verification, **My orders** loads the account's 20 latest saved orders from
`GET /orders`. It shows quantities, saved unit prices/totals, order IDs and statuses.
Creation refreshes the list; reload restores it after session validation. Disconnect
hides it, and account changes discard pending results from the previous session.
Check creation, reload, manual Refresh and switching between two verified accounts.
Full build, tests and browser checks for the list remain pending.

Wallet connection uses `@hot-labs/near-connect`, fixed to Testnet and wallets supporting sign-in without adding a key and NEP-413 signing. `WalletProvider` owns the connector and account/session state; `WalletPanel` provides connection and ownership verification. The tab saves its token in `sessionStorage` and validates it with the backend after reload, without extending its one-hour expiry. Disconnect revokes the session and clears storage. Transfers remain pending; see [authentication](../docs/AUTH.md).

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

Budget input and display use decimal strings without floating-point conversion. Creating an order requires wallet ownership verification; the frontend sends its Bearer token and clears displayed orders when the session changes. In-flight responses from a previous session are discarded. The backend remains authoritative for buyer identity, prices and budget checks. Submitting creates an unpaid order; there are no automatic retries. The user must review model choices before payment.

Check a normal request, an over-budget purchase, an unavailable product, and a stopped Ollama server. The purchase screen and wallet connection/reload restoration/disconnect passed reported browser checks. Closing the wallet modal must leave purchase creation usable; cancellation and provider-failure checks remain in the manual checklist. Keep the same origin when checking restoration. Payments are pending.
