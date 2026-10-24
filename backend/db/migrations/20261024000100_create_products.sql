-- migrate:up
-- IF NOT EXISTS also adopts the table created by the initial bootstrap script.
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    price_yocto NUMERIC(39, 0) NOT NULL CHECK (price_yocto > 0)
);

-- migrate:down
DROP TABLE products;
