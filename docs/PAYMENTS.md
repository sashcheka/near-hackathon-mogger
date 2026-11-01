# Testnet transfer verification

`POST /orders/{id}/verify-payment` accepts exactly:

```json
{"transaction_hash":"BASE58_TRANSACTION_HASH","sender_id":"buyer.testnet"}
```

The recipient and exact yoctoNEAR amount come from the saved order, never from request fields or the current catalog. Configure `MERCHANT_ACCOUNT_ID` before creating the order; the [root startup guide](../README.md) includes the launch command. Orders without a saved recipient return HTTP 409 `payment_not_configured`.

The RPC client checks the reported chain ID, requests [`tx` with `wait_until: FINAL`](https://docs.near.org/api/rpc/transactions), and requires a successful result, the requested hash and signer, the saved recipient, and exactly one native `Transfer` action with the saved amount. It also verifies the matching transfer receipt's successful execution by the recipient. `NEAR_TESTNET_RPC_URL` overrides the default `https://rpc.testnet.near.org`; a reported non-Testnet chain is rejected. Each RPC call has a 15-second timeout, one attempt, and no redirects.

HTTP 200 returns `verified: true`, `order_id`, `transaction_hash`, `sender_id`, `network_id`, and the unchanged `order_status`. This verifies chain facts against a claimed sender. It does not authenticate wallet ownership, enforce that a transfer happened after order creation, reserve a transaction, prevent reuse across orders, or mark an order paid. Those checks and durable recording must be added before accepting payments.

| HTTP | Error |
| --- | --- |
| 202 | `transaction_pending` — not finalized yet, or RPC finality wait expired |
| 400 | `invalid_request` |
| 404 | `order_not_found`, `transaction_not_found` |
| 409 | `payment_not_configured`, `transaction_mismatch`, `transaction_failed` |
| 502 | `invalid_rpc_response`, `rpc_wrong_network` |
| 503 | `rpc_unavailable` |
| 504 | `rpc_timeout` |

After building, an existing transaction can be checked from a separate terminal:

```sh
curl -i http://localhost:8080/orders/ORDER_UUID/verify-payment \
  -H 'Content-Type: application/json' \
  -d '{"transaction_hash":"BASE58_TRANSACTION_HASH","sender_id":"buyer.testnet"}'
```

HTTP tests use a mocked RPC endpoint and require no wallet, test tokens, Ollama, or live RPC access. They cover saved prices, exact large amounts, malformed/failed/pending transactions, receipt checks, network mismatch, transport errors, and unchanged order status. Test configuration removes environment overrides for the model, merchant, and RPC. C++ syntax checks have passed for the client, handler, and component registration; full build, HTTP tests, and real-transfer validation are pending.
