# Frontend

React + TypeScript purchase screen, built with Vite. Enter a request and budget in
test NEAR, then review the product, quantity and price. **Pay** requests a native
Testnet transfer in the connected wallet and verifies it through the backend.

**Orders**, to the left of the wallet buttons, opens a separate view instead of the
purchase form. The same button becomes **← Back to purchase** and restores the
form without losing input values; there is no separate back button.
After verification, **My orders** loads the account's 20 latest saved orders from
`GET /orders`. It shows quantities, saved unit prices/totals, order IDs and statuses.
**Review & pay** opens a pending order; **View** opens a paid one.
Creation refreshes the list; reload restores it after session validation. Disconnect
hides it, and account changes discard pending results from the previous session.
Check creation, reload, manual Refresh and switching between two verified accounts.
Full build, tests and browser checks for the list remain pending.

The list distinguishes **Awaiting payment** and **Paid** using saved backend
statuses. Returning to the purchase view reloads the current order's status.
Payment details are fetched again before sending. The transfer uses one exact
yoctoNEAR deposit, the saved recipient, and explicit Testnet/signer parameters.
**Check payment** never sends funds. Only backend confirmation followed by a saved
`paid` order updates the result. See [recovery behavior](../docs/PAYMENTS.md#browser-payment-flow).

Wallet connection uses `@hot-labs/near-connect`, fixed to Testnet and wallets supporting NEP-413 signing and transaction sending. `WalletProvider` owns wallet/session state and the transfer action. The tab saves its token in `sessionStorage` and validates it after reload without extending expiry. Disconnect revokes the session; pending payment recovery survives logout. See [authentication](../docs/AUTH.md).

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

Check a normal purchase, over-budget/model errors, Orders → Back to purchase and
preserved inputs. For payments check cancellation, 202/timeouts, reload before and
after confirmation, unknown wallet results, two tabs and account changes. Keep the
same origin for recovery. TypeScript/test-file syntax checks passed; `npm test`,
production build and a real wallet transfer remain pending.
