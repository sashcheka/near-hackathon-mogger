# Stage 1: Budget-controlled purchase

## Scope

One user, one demo merchant, a small product catalog, one real model integration, and native NEAR Testnet payments confirmed by the user. Demo prices are expressed in test NEAR.

The model selects a product and quantity. The backend derives the amount and recipient from the catalog, checks the budget, and records the order before requesting payment. Amounts use exact integer yoctoNEAR values and strings in JSON.

## Acceptance criteria

- A request with a budget of 3 test NEAR can purchase a product priced at 2; a product priced at 50 is blocked.
- The model is actually called through an API or local runtime. Catalog data is treated as data, not instructions.
- A model failure leaves the purchase unpaid and displays an error.
- The user confirms an allowed purchase in their own wallet; the backend stores no wallet keys.
- A payment is recorded as successful only after verifying its sender, recipient, amount, and successful finalized outcome. A transaction cannot pay multiple orders.
- Orders and payment results persist in PostgreSQL and appear in the UI.

The store is a demo implementation. Product delivery is simulated. Autonomous spending, custom contracts, scheduling, governance, ML fraud scoring, and Intents execution are outside this stage.

## Implementation sequence

1. Build the C++ service and implement `GET /health`. **Complete:** build, HTTP integration test, and standalone endpoint verification pass.
2. Add PostgreSQL, the demo catalog, and order storage. Database configuration, product schema, seed data, and `GET /products` are implemented. Catalog endpoint validation, versioned migrations, and order storage remain.
3. Implement deterministic purchase validation and focused tests.
4. Connect the model to product selection.
5. Add the React purchase screen.
6. Connect the wallet and verify Testnet payments end to end.
