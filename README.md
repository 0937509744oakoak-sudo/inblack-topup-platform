# InBlack Top-Up Platform

Runnable local scaffold for an order/payment/top-up flow. Monetary fields are `BIGINT` satang in PostgreSQL and `bigint` in TypeScript. JSON serializes satang as decimal strings. No monetary calculation uses floating point.

## Run

1. Copy `.env.example` to `.env`; change the local secrets if needed.
2. Run `docker compose up --build` from this directory.
3. API: `http://localhost:3000`; Mailpit UI: `http://localhost:8025`.

Compose runs two API replicas, one worker, Postgres, Redis, mock-pay, mock-game, and Mailpit. Docker Compose's `deploy.replicas` is honored by `docker compose up` on current Compose releases; scale explicitly with `docker compose up --scale api=2` if your version ignores it. The local mock-pay hits the API service name, so in production place a load balancer in front of API replicas.

## Create a test order

```http
POST http://localhost:3000/api/orders
Idempotency-Key: demo-order-001
Content-Type: application/json

{"sku":"GEM-100","quantity":1,"method":"PROMPTPAY","voucherCode":"WELCOME50"}
```

Call mock-pay with the returned orderId:

```http
POST http://localhost:3000/mock-pay/pay
Content-Type: application/json

{"orderId":"<orderId>"}
```

Check `GET /api/orders/<orderId>` (endpoint shown as a scaffold extension point; order creation response includes status and monetary breakdown). The mock-pay public route is currently exposed through its own internal service; use `docker compose exec mock-pay` or expose port 4001 locally to call it from the host.

## Invariants and implementation notes

- Price sequence: `subtotal = unit × quantity`; `net = subtotal − discount`; fee is calculated on net; `total = net + fee`; VAT is then calculated on total, with integer half-up rounding. TrueMoney fee is `ceil(net × 150 / 10000)`; Card is `ceil(net × 290 / 10000) + 30000` satang (THB 3.00); PromptPay is zero. VAT is 7% by default, configured with `VAT_BPS`.
- Note: the brief does not say whether VAT is included in `Total`. This scaffold defines Total as the payment amount before VAT and reports VAT separately; change that contract explicitly if VAT must be added to charge amount.
- Expiry release restores product stock and voucher reservation exactly once in an expiry sweep transaction. Payment webhook arriving after expiry moves the order to `NEEDS_REVIEW` and does not top up automatically. An operator must reconcile payment and decide to refund or resume.
- Order events have a database trigger forbidding update/delete. State changes append events in the same transaction.
- Payment callbacks verify `X-IBM-Signature` as lowercase hex HMAC-SHA256 over the exact JSON body serialization. Real providers must sign raw request bytes using their documented canonicalization; replace this mock contract accordingly.
- `mock-game` can return success/failure. Any uncertain result enters `NEEDS_REVIEW`; automatically retrying an ambiguous top-up could duplicate delivery.
- The scaffold demonstrates idempotency records with same response replay and 422 on changed request body. For concurrent requests, the primary key serializes claims.
- Redis is provisioned for future rate limiting/distributed coordination; durable order work uses a Postgres jobs table so payment state and enqueue happen atomically.

## Structure

```text
db/schema.sql
src/app.ts                 API, order creation, payment webhook
src/money.ts               integer satang pricing
src/state-machine.ts       allowed state transitions
src/worker.ts              durable Postgres job worker
src/services/mock-pay.ts   HMAC-signed test payment callback
src/services/mock-game.ts  simulated game delivery
Dockerfile
docker-compose.yml
```

This is a runnable development scaffold, not a production payment integration. Add authenticated customer access, raw-body provider signature validation, migrations, structured observability, expiry sweep scheduling, and provider reconciliation before production.
