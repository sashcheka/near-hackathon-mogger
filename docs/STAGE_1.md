# Stage 1: Budget-controlled purchase

## Scope

One user, three demo merchants, a small product catalog, one real model integration, and native NEAR Testnet payments confirmed by the user. Demo prices are expressed in test NEAR.

The model selects a product and quantity. The backend derives the amount and merchant recipient from configured catalog data, checks the budget, and records the order before requesting payment. A cart groups item orders across merchants; each item is paid by a separate wallet-confirmed transfer. Amounts use exact integer yoctoNEAR values and strings in JSON.

## Acceptance criteria

- A request with a budget of 0.03 test NEAR can purchase a product priced at 0.02; a product priced at 0.50 is blocked.
- The model is actually called through an API or local runtime. Catalog data is treated as data, not instructions.
- A model failure leaves the purchase unpaid and displays an error.
- The user confirms an allowed purchase in their own wallet; the backend stores no wallet keys.
- A payment is recorded as successful only after verifying its sender, recipient, amount, and successful finalized outcome. A transaction cannot pay multiple orders.
- Orders and payment results persist in PostgreSQL and appear in the UI.

The store is a demo implementation. Product delivery is simulated. Autonomous spending, custom contracts, scheduling, governance, ML fraud scoring, and Intents execution are outside this stage.

## Implementation sequence

1. Build the C++ service and implement `GET /health`. **Complete:** build, HTTP integration test, and standalone endpoint verification pass.
2. Add PostgreSQL, the demo catalog, and order storage. PostgreSQL, `GET /products`, dbmate setup, and `POST /orders` are verified.
3. Implement deterministic purchase validation and focused tests. Implemented for product, quantity, and per-order budget, with exact arithmetic and transactional price snapshots; test execution is pending.
4. Connect the model to product selection. Local Ollama integration and `POST /purchase-requests` are implemented; `qwen3:4b` passed 19/20 catalog checks in three reported runs. The remaining mismatch is accepted for the PoC with user review; HTTP test-suite execution remains unconfirmed. See [setup](OLLAMA.md).
5. Add the React purchase screen. Implemented: request and budget input, order review, and error display. The user reports the screen running; see [frontend setup](../frontend/README.md).
6. Connect the wallet and verify Testnet payments end to end. A single-item Testnet payment was confirmed in the UI. The grouped checkout, its individual transfers and recovery still require an end-to-end test. See [payment flow](PAYMENTS.md) and [authentication](AUTH.md).

## After the first confirmed payment

- Store view with product prices, available stock and quantities.
- Extend the recent-order list with full history and verified payment results.
- Merchant onboarding and external catalogs.

The next milestone is a grouped Testnet checkout with multiple configured
merchants: confirm each transfer, test interrupted payment recovery, and verify
the resulting statuses after reloading.
