CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  price_satang BIGINT NOT NULL CHECK (price_satang >= 0), stock INTEGER NOT NULL CHECK (stock >= 0),
  active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vouchers (
  code TEXT PRIMARY KEY, discount_satang BIGINT NOT NULL CHECK (discount_satang >= 0),
  max_uses INTEGER NOT NULL CHECK (max_uses >= 0), used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0), expires_at TIMESTAMPTZ,
  CHECK (used_count + reserved_count <= max_uses)
);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK (quantity > 0),
  voucher_code TEXT REFERENCES vouchers(code), payment_method TEXT NOT NULL CHECK(payment_method IN ('PROMPTPAY','TRUEMONEY','CARD')),
  state TEXT NOT NULL CHECK(state IN ('PENDING_PAYMENT','PAID','IN_QUEUE','IN_PROGRESS','COMPLETED','EXPIRED','FAILED','REFUNDED','NEEDS_REVIEW')),
  subtotal_satang BIGINT NOT NULL CHECK(subtotal_satang >= 0), discount_satang BIGINT NOT NULL CHECK(discount_satang >= 0),
  net_satang BIGINT NOT NULL CHECK(net_satang >= 0), fee_satang BIGINT NOT NULL CHECK(fee_satang >= 0),
  total_satang BIGINT NOT NULL CHECK(total_satang >= 0), vat_satang BIGINT NOT NULL CHECK(vat_satang >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'THB' CHECK(currency='THB'), expires_at TIMESTAMPTZ NOT NULL,
  payment_ref TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_state_created_idx ON orders(state,created_at);
CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY, order_id UUID NOT NULL REFERENCES orders(id), from_state TEXT, to_state TEXT NOT NULL,
  event_type TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION forbid_order_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'order_events is append-only'; END $$;
DROP TRIGGER IF EXISTS order_events_immutable ON order_events;
CREATE TRIGGER order_events_immutable BEFORE UPDATE OR DELETE ON order_events FOR EACH ROW EXECUTE FUNCTION forbid_order_event_mutation();
CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGSERIAL PRIMARY KEY, provider TEXT NOT NULL, event_id TEXT NOT NULL, signature_valid BOOLEAN NOT NULL,
  payload JSONB NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(provider,event_id)
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, response_status INTEGER, response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY, order_id UUID NOT NULL UNIQUE REFERENCES orders(id), available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
);
INSERT INTO products(sku,name,price_satang,stock) VALUES ('GEM-100','100 Gems',19900,1000) ON CONFLICT(sku) DO NOTHING;
INSERT INTO vouchers(code,discount_satang,max_uses) VALUES ('WELCOME50',5000,100) ON CONFLICT(code) DO NOTHING;
