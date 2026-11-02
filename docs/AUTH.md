# Wallet authentication

Authentication uses [NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md)
message signing, independently of payment transactions. No wallet keys reach the backend.

The verifier supports Ed25519 keys, canonical Base58 public keys and Base64
signatures. It reconstructs the Borsh payload with the NEP-413 tag and no callback
URL, hashes it with SHA-256, and verifies the signature using OpenSSL. A finalized
Testnet `view_access_key` query must confirm the signing key has `FullAccess`
permission on the claimed account. Function-call keys are rejected.

The cryptographic verifier is implemented. The challenge/session API and browser
signing flow are the next integration steps; connecting a wallet alone does not
authenticate a user.
