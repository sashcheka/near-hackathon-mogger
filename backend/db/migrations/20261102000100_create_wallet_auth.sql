-- migrate:up
CREATE TABLE auth_challenges (
    nonce TEXT PRIMARY KEY CHECK (length(nonce) = 44),
    account_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes'
);
CREATE INDEX auth_challenges_expiry_idx ON auth_challenges(expires_at);

CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
    account_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour'
);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

-- migrate:down
DROP TABLE auth_sessions;
DROP TABLE auth_challenges;
