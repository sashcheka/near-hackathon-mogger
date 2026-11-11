# Community Treasury

A budget-controlled purchasing assistant. An AI model selects a product, the backend validates the purchase, and the user confirms payment through a NEAR wallet.

## Local development

macOS + Colima workflow. Prerequisites: Docker CLI with Compose, Colima, Ollama, and VS Code with Dev Containers. C++, Node.js, and npm run inside the dev container. Install Ollama once with `brew install ollama`. Clone this repository and open its root in VS Code.

**1. Mac terminal, repository root — PostgreSQL.** Start Colima if stopped, then apply migrations and demo data:

```sh
colima start
docker compose up -d --wait postgres &&
docker compose run --rm migrate &&
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U treasury -d treasury < backend/db/seed.sql
```

Demo prices range from 0.01 to 0.50 test NEAR; toilet paper costs 0.02. Apply migrations to update an existing catalog. Existing orders keep their saved amounts; create a new order to use the new prices.

After wallet verification, **Purchase rules** lets each buyer save an optional
per-purchase limit, unit-price limit and allowed merchant. The backend checks
new orders and records the decision; the UI shows recent checks and rechecks
current rules before opening the wallet for an unpaid order. The purchase budget
is a limit, not a wallet balance. Rules are enforced by this application, not
on-chain, and the wallet owner confirms every transfer.

**2. Another Mac terminal — Ollama.** Leave this server running:

```sh
ollama serve
```

Download the model once from another Mac terminal: `ollama pull qwen3:4b`. If Ollama is already serving, reuse that process.

**3. VS Code — Dev Containers: Reopen in Container.** PostgreSQL must be running first to create the Docker network. Existing dev containers can be reopened; rebuild only after environment configuration changes.

**4. Dev container terminal — backend.** The initial build is slow; later builds reuse the persistent build volume. Leave the server running:

```sh
cd /app/backend &&
cmake --preset docker &&
cmake --build --preset docker &&
ctest --preset docker &&
OLLAMA_MODEL=qwen3:4b \
OLLAMA_CHAT_URL=http://host.lima.internal:11434/api/chat \
  ./build/community_treasury_backend --config configs/static_config.yaml
```

For an unchanged, already-built backend, run only the environment assignments and executable from `/app/backend`. The default merchant uses `MERCHANT_ACCOUNT_ID`; other merchants use their configured database accounts.

**5. Another dev container terminal — frontend.** Leave Vite running:

```sh
cd /app/frontend &&
npm ci &&
npm test &&
npm run build &&
npm run dev
```

Open `http://localhost:5173` through VS Code's forwarded port. Backend health: `curl --fail http://localhost:8080/health`. Vite forwards `/api` to the backend inside the container. After frontend-only edits, Vite reloads automatically; rerun `npm ci` when dependencies change.

Open **Store** to browse products by merchant and add them to a shared cart.
Search by product or merchant, filter by shop or payment setup, and sort prices
within the loaded demo catalog.
Connect and verify your wallet to ask the AI for a product suggestion or create
an order. AI suggestions can be reviewed and added to the same cart. Checkout
checks the total budget and saved rules before creating any item orders. Each
item needs a separate wallet-confirmed Testnet transfer; partial payments can
be reviewed and recovered in the grouped order. A saved allowed-merchant rule
must permit every merchant in the cart.

The default merchant uses `MERCHANT_ACCOUNT_ID`. Fresh Market and Home Market
need their own Testnet accounts before their products can be ordered. From a
Mac terminal, open PostgreSQL and replace the examples with public account IDs:

```sh
docker compose exec postgres psql -U treasury -d treasury
```

```sql
UPDATE merchants SET account_id = 'fresh-merchant.testnet' WHERE id = 'fresh';
UPDATE merchants SET account_id = 'home-merchant.testnet' WHERE id = 'home';
\q
```

The demo catalog can be browsed before accounts are configured. Existing orders
retain their original recipients; changing a merchant account affects new orders.

Other host setups and the standalone backend image: [backend setup](backend/README.md); model settings: [Ollama setup](docs/OLLAMA.md).

## Stop all services

1. In the dev container, press `Ctrl+C` in the backend terminal and in the frontend/Vite terminal.
2. On the Mac, press `Ctrl+C` in the terminal running `ollama serve` to stop the model server.
3. Close the VS Code dev container window. Its `shutdownAction: stopContainer` stops the development container.
4. From a Mac terminal in the repository root, stop the Compose services and the Colima VM:

```sh
docker compose stop
colima stop
```

`docker compose stop` stops PostgreSQL and any standalone Compose backend. `colima stop` shuts down the Linux VM. Neither command deletes containers, images, build cache, or volumes. Source files, database data, cached C++ build, VS Code extensions, and Codex sessions are retained. Resume with the startup steps above.

## Wallet connection

Click **Connect wallet**, choose a Testnet-compatible wallet, and approve the connection. The UI shows its account ID, restores the connection after a page reload, and offers **Disconnect**. Use the same browser and `localhost:5173` origin when checking restoration. Integration uses [NEAR Connect](https://docs.near.org/tools/near-connect); the browser needs internet access for the wallet manifest and provider.

The wallet panel shows the connected account's NEAR Testnet balance from RPC.
It refreshes after a confirmed payment or via **Refresh**. This balance includes
the storage reserve; the spendable amount also needs to cover network fees.

If you do not have a Testnet account yet, create one in the selected wallet first. This does not configure the merchant recipient; that separate account will be set up before payments.

Click **Verify ownership** and approve the sign-in message to authenticate the connected account. The backend checks the NEP-413 signature and the account's FullAccess key through Testnet RPC. This does not transfer funds. Authentication requires the latest database migration; see [API and checks](docs/AUTH.md). The tab keeps its token in `sessionStorage`; reload restores verification only after the backend validates the session for the connected account. Reload does not extend the one-hour expiry. Disconnect revokes the session and clears the saved token.

Order creation, retrieval and transfer verification now require a verified session. The backend saves the session account as the buyer and restricts access to its orders; old unowned orders remain stored but cannot be claimed. The frontend sends the token and clears its displayed order when the session changes. Apply migrations before rebuilding the backend. Full build/tests and the updated browser flow still need to be checked. Wallet connection does not mark orders paid.

Click **Orders** to the left of the wallet buttons to load the verified account's
recent single-product and grouped orders with prices and payment status. The same button
becomes **← Back to purchase** and returns to the form with its inputs preserved.
The list has a **Refresh** button. Old unowned orders do not appear. The list
requires the updated backend's `GET /orders` and `GET /checkouts` endpoints.

## Merchant and transfer verification

Create a separate Testnet merchant account in your wallet. Stop the backend and relaunch it from the dev container; replace `your-merchant.testnet` with that account ID:

```sh
cd /app/backend
MERCHANT_ACCOUNT_ID=your-merchant.testnet \
OLLAMA_MODEL=qwen3:4b \
OLLAMA_CHAT_URL=http://host.lima.internal:11434/api/chat \
  ./build/community_treasury_backend --config configs/static_config.yaml
```

Create a new order afterward. `GET /orders/{id}` must show the merchant in `payment.receiver_id`, network `testnet`, and the saved total in `payment.amount_yocto`. Older orders keep their original recipient, including `null`.

`POST /orders/{id}/verify-payment` checks an existing finalized Testnet transfer,
requires it to follow order creation, and atomically records the payment and marks
the owned order `paid`. A transaction cannot pay multiple orders; retrying the same
accepted payment returns its saved result. **Pay** requests one wallet-confirmed
transfer; **Check payment** retries verification without sending again. See
[payment flow and recovery](docs/PAYMENTS.md). The frontend requires a current
browser with local storage and Web Locks on localhost or HTTPS. Frontend-only
payment UI changes need no backend rebuild or additional migration.

To check a real Testnet purchase:

1. Connect and verify the buyer wallet; fund it with [test NEAR](https://near-faucet.io/) for the order plus its network fee.
2. Create an order, or open **Orders → Review & pay**. Review its product, saved amount and merchant.
3. Click **Pay** and confirm the Testnet transfer in the wallet. Wait for **Paid**, or use **Check payment** with the saved hash.
4. Reload and open **Orders**: the result must still be **Paid**. Check the merchant wallet's received transfer.

TypeScript/static checks passed. Full frontend tests/build, wallet cancellation
checks and the first real transfer still require developer validation.

## Stage 1

One user, three demo merchants, a real model call, and user-confirmed NEAR Testnet transfers.

```mermaid
flowchart TD
    UI[React + TypeScript] -->|Purchase request| API[C++ backend]
    API -->|Product selection| AI[Model API or local model]
    API -->|Validate against catalog and budget| Policy[Purchase rules]
    API --> DB[(PostgreSQL: orders and payments)]
    UI -->|Confirm validated purchase| Wallet[NEAR wallet]
    Wallet -->|Testnet transfer| Store[Demo merchant account]
    API -->|Verify payment result| RPC[NEAR Testnet RPC]
```

| Component | Location | Responsibility |
| --- | --- | --- |
| C++20 backend | [backend/](backend/) | Catalog, model integration, purchase validation, order history, and payment verification |
| PostgreSQL | Schema managed by backend | Orders and verified payment records |
| React + TypeScript | [frontend/](frontend/) | Request input, purchase review, wallet confirmation, and result display |
| Stage specification | [docs/STAGE_1.md](docs/STAGE_1.md) | Scope, acceptance criteria, and implementation sequence |

The backend derives prices and merchant recipients from configured catalog data, validates spending limits independently of the model, and holds no wallet keys. Payment success requires verification of the transaction outcome.

Future extensions include scheduled purchases, contract-enforced spending permissions, merchant APIs, NEAR Intents, and collective budgets. Stage 1 uses direct Testnet transfers without a custom Rust contract.

The backend exposes catalog, owned orders, AI selection and durable payment
acceptance. Orders save the validated price, configured merchant and Testnet network.
An earlier [Ollama catalog check](docs/OLLAMA.md) passed 19/20 cases in three
reported runs. A single-item Testnet payment was confirmed in the UI. The updated
merchant-aware model, grouped checkout and payment recovery require full validation.
