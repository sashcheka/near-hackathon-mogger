# Wallet authentication

Authentication uses [NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md)
message signing, independently of payment transactions. No wallet keys reach the backend.

The verifier supports Ed25519 keys, canonical Base58 public keys and Base64
signatures. It reconstructs the Borsh payload with the NEP-413 tag and no callback
URL, hashes it with SHA-256, and verifies the signature using OpenSSL. A finalized
Testnet `view_access_key` query must confirm the signing key has `FullAccess`
permission on the claimed account. Function-call keys are rejected.

## API

1. `POST /auth/challenge` with `{"account_id":"buyer.testnet"}` returns
   `nonce` (32 bytes encoded as Base64), `message`, `recipient` and `expires_in:300`.
2. Sign those exact values using the wallet's `signMessage` method.
3. `POST /auth/verify` with `nonce`, `public_key` and `signature` returns
   `token`, `account_id` and `expires_in:3600`.
4. Send `Authorization: Bearer <token>` to `GET /auth/session` to check the
   session, or `DELETE /auth/session` to revoke it.

Challenges and sessions persist in PostgreSQL. Successful verification atomically
consumes a fresh challenge and creates one session, including under concurrent
requests. Only the SHA-256 hash of the random session token is stored. Expired
records are removed when issuing new challenges. Auth responses use `no-store`.

`AUTH_RECIPIENT` defaults to `localhost:5173`; use an application-specific recipient
when deploying elsewhere. `NEAR_TESTNET_RPC_URL` configures the RPC endpoint.
Apply migrations before starting the updated backend. A backend restart does not
invalidate unexpired sessions. Connecting a wallet alone does not authenticate a
user. Order access restrictions and payment recording are separate steps.

Invalid input returns 400; invalid/expired/reused challenges and invalid signatures
or account keys return 401. RPC failures return 502/503/504 and never create a
session. No fallback accepts an unverified account.
