# Testnet payment acceptance

`POST /orders/{id}/verify-payment` requires `Authorization: Bearer <token>` from a
verified wallet session and accepts exactly:

```json
{"transaction_hash":"BASE58_TRANSACTION_HASH"}
```

The sender comes from the verified session. The saved order must belong to that
account; foreign and legacy unowned orders return 404 `order_not_found`. A caller
cannot supply `sender_id` or `buyer_id`. The recipient and exact yoctoNEAR amount
come from the saved order, never from request fields or the current catalog.
Configure `MERCHANT_ACCOUNT_ID` before creating the order; the [root startup guide](../README.md)
includes the launch command. Orders without a saved recipient return HTTP 409 `payment_not_configured`.

The RPC client checks the reported chain ID, requests [`tx` with `wait_until: FINAL`](https://docs.near.org/api/rpc/transactions), and requires a successful result, the requested hash and signer, the saved recipient, and exactly one native `Transfer` action with the saved amount. It also verifies the matching transfer receipt's successful execution by the recipient. It fetches the transaction outcome's [block header](https://docs.near.org/api-reference/post-block), checks its hash, and reads `timestamp_nanosec` as an exact unsigned 64-bit integer string. `NEAR_TESTNET_RPC_URL` overrides the default Testnet endpoint. Each RPC call has a 15-second timeout, one attempt, and no redirects.

HTTP 200 returns `verified: true`, `order_id`, `transaction_hash`, `sender_id`,
`network_id`, and `order_status: paid`. A PostgreSQL transaction locks the order,
rechecks ownership and its price/recipient snapshot, inserts a payment and marks
the order paid. RPC calls finish before acquiring this lock.

The outcome block timestamp must be strictly later than the saved order creation
time; comparisons use exact PostgreSQL numeric arithmetic. Keep the database host
clock synchronized. An old transfer cannot pay a newer order. The payment stores
its sender, receiver, amount, block hash/time and verification time. Unique keys
allow one payment per order and one order per network/transaction hash, including
under concurrent requests.

Repeating the accepted hash for the same owned order returns the saved success
without RPC access. Another hash for that paid order returns 409. Other errors
leave an unpaid order unchanged and create no payment. After 202 or a timeout,
retry verification with the same hash. This endpoint never broadcasts a transfer.

Apply migrations before restarting the backend. The payments migration preserves
unpaid orders; rollback is refused while paid orders remain. The browser transfer
flow is implemented; a real end-to-end Testnet payment still needs manual validation.

## Browser payment flow

**Pay** is available on new orders and through **Orders → Review & pay**. The UI
shows the saved merchant and amount before requesting a transfer with
[NEAR Connect](https://docs.near.org/web3-apps/tutorials/wallet-login). The backend
order is fetched again; changed reviewed details block sending. Only one native
`Transfer` action is requested, with an exact decimal yoctoNEAR string and explicit
Testnet/signer parameters. The wallet holds the keys and asks the user to confirm.

Before opening the wallet, a recovery marker is written to `localStorage`, scoped
by Testnet/account/order. The returned transaction hash is saved before calling
verification. Same-origin Web Locks coordinate tabs; an unavailable lock or
disabled storage prevents starting a transfer. Use localhost or HTTPS.

After 202, network errors or reload, **Check payment** uses the saved hash and never
opens another transfer request. A backend-confirmed `paid` result is reloaded before
clearing recovery data. Expired sessions require ownership verification again;
recovery survives logout and is separate from the session token.

Explicitly reported wallet cancellation clears an unsent marker. Closing a popup or
losing the result is ambiguous: Pay stays blocked. The user can supply the hash from
wallet history. **Allow a new payment** only clears a hashless marker after the user
confirms no transfer was sent and no confirmation is open; it sends no funds.
A saved hash cannot be reset this way. Known failed/mismatched transfers remain
available for checking and require reconciliation before another payment for that order.

Recovery is local to this browser/origin; it does not coordinate separate devices
or survive clearing browser data. Backend uniqueness prevents accepting one hash
twice, but cannot undo two separately confirmed on-chain transfers. Do not start
another payment while a previous wallet result is unresolved.

| HTTP | Error |
| --- | --- |
| 202 | `transaction_pending` — not finalized yet, or RPC finality wait expired |
| 400 | `invalid_request` |
| 401 | `unauthorized` — missing, invalid, expired or revoked session |
| 404 | `order_not_found`, `transaction_not_found` |
| 409 | `payment_not_configured`, `transaction_mismatch`, `transaction_failed`, `transaction_before_order`, `transaction_already_used`, `order_already_paid`, `order_changed` |
| 502 | `invalid_rpc_response`, `rpc_wrong_network` |
| 503 | `rpc_unavailable` |
| 504 | `rpc_timeout` |

After building, an existing transaction can be checked from a separate terminal:

```sh
curl -i http://localhost:8080/orders/ORDER_UUID/verify-payment \
  -H "Authorization: Bearer $TREASURY_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"transaction_hash":"BASE58_TRANSACTION_HASH"}'
```

HTTP tests use a mocked RPC endpoint and require no wallet, test tokens, Ollama, or
live RPC access. They cover exact amounts, finalized receipts, block identity/time,
nanosecond boundaries, rejected responses, persistence, retries with RPC down,
changed order snapshots and concurrent duplicate/reused payments. C++/Python
syntax checks passed; full build, HTTP tests and real-transfer validation are pending.
