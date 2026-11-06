"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const node_crypto_1 = require("node:crypto");
const db_1 = require("./db");
const money_1 = require("./money");
const state_machine_1 = require("./state-machine");
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: '64kb' }));
const json = (v) => JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? x.toString() : x);
app.get('/health', async (_q, r) => { try {
    await db_1.pool.query('SELECT 1');
    r.json({ ok: true });
}
catch {
    r.status(503).json({ ok: false });
} });
app.get('/api/orders/:id', async (req, res) => { try {
    const q = await db_1.pool.query('SELECT public_id AS "orderId",state,currency,subtotal_satang::text,discount_satang::text,net_satang::text,fee_satang::text,total_satang::text,vat_satang::text,created_at,expires_at FROM orders WHERE public_id=$1', [req.params.id]);
    if (!q.rowCount)
        return res.status(404).json({ error: 'Order not found' });
    res.json(q.rows[0]);
}
catch {
    return res.status(500).json({ error: 'Lookup failed' });
} });
app.post('/api/orders', async (req, res) => {
    const key = req.header('Idempotency-Key');
    if (!key || key.length > 128)
        return res.status(400).json({ error: 'Idempotency-Key required (max 128)' });
    const { sku, quantity, method, voucherCode } = req.body || {};
    if (typeof sku !== 'string' || !Number.isSafeInteger(quantity) || quantity < 1 || !['PROMPTPAY', 'TRUEMONEY', 'CARD'].includes(method))
        return res.status(400).json({ error: 'Invalid order' });
    const hash = (0, node_crypto_1.createHash)('sha256').update(json({ sku, quantity, method, voucherCode: voucherCode || null })).digest('hex');
    const c = await db_1.pool.connect();
    try {
        await c.query('BEGIN');
        const prior = await c.query('SELECT * FROM idempotency_keys WHERE key=$1 FOR UPDATE', [key]);
        if (prior.rowCount) {
            if (prior.rows[0].request_hash !== hash) {
                await c.query('ROLLBACK');
                return res.status(422).json({ error: 'Idempotency key reused with different body' });
            }
            if (prior.rows[0].response_body) {
                await c.query('COMMIT');
                return res.status(prior.rows[0].response_status).json(prior.rows[0].response_body);
            }
        }
        else
            await c.query('INSERT INTO idempotency_keys(key,request_hash) VALUES($1,$2)', [key, hash]);
        const p = await c.query('SELECT * FROM products WHERE sku=$1 AND active=true FOR UPDATE', [sku]);
        if (!p.rowCount)
            throw new Error('Product unavailable');
        const product = p.rows[0];
        const reserve = await c.query('UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING id', [quantity, product.id]);
        if (!reserve.rowCount)
            throw new Error('Out of stock');
        let discount = 0n;
        if (voucherCode) {
            const v = await c.query('SELECT * FROM vouchers WHERE code=$1 FOR UPDATE', [voucherCode]);
            if (!v.rowCount || v.rows[0].used_count + v.rows[0].reserved_count >= v.rows[0].max_uses || (v.rows[0].expires_at && new Date(v.rows[0].expires_at) < new Date()))
                throw new Error('Voucher unavailable');
            discount = BigInt(v.rows[0].discount_satang);
            await c.query('UPDATE vouchers SET reserved_count=reserved_count+1 WHERE code=$1', [voucherCode]);
        }
        const price = (0, money_1.calculatePrice)({ unitPriceSatang: BigInt(product.price_satang), quantity, discountSatang: discount, method, vatBps: BigInt(process.env.VAT_BPS || 700) });
        const inserted = await c.query(`INSERT INTO orders(product_id,quantity,voucher_code,payment_method,state,subtotal_satang,discount_satang,net_satang,fee_satang,total_satang,vat_satang,expires_at) VALUES($1,$2,$3,$4,'PENDING_PAYMENT',$5,$6,$7,$8,$9,$10,now()+interval '15 minutes') RETURNING *`, [product.id, quantity, voucherCode || null, method, ...[price.subtotalSatang, price.discountSatang, price.netSatang, price.feeSatang, price.totalSatang, price.vatSatang].map(String)]);
        const o = inserted.rows[0];
        await c.query("INSERT INTO order_events(order_id,to_state,event_type,metadata) VALUES($1,'PENDING_PAYMENT','ORDER_CREATED',$2)", [o.id, price]);
        const body = { orderId: o.public_id, state: o.state, currency: 'THB', ...(0, money_1.serializePrice)(price) };
        await c.query('UPDATE idempotency_keys SET response_status=201,response_body=$2 WHERE key=$1', [key, body]);
        await c.query('COMMIT');
        res.status(201).json(body);
    }
    catch (e) {
        await c.query('ROLLBACK');
        res.status(409).json({ error: e instanceof Error ? e.message : 'Order failed' });
    }
    finally {
        c.release();
    }
});
app.post('/api/webhooks/mock-pay', async (req, res) => { const sig = req.header('X-IBM-Signature') || ''; const expected = (0, node_crypto_1.createHmac)('sha256', process.env.WEBHOOK_SECRET || '').update(json(req.body)).digest('hex'); const a = Buffer.from(sig), b = Buffer.from(expected); if (a.length !== b.length || !(0, node_crypto_1.timingSafeEqual)(a, b))
    return res.status(401).json({ error: 'Invalid signature' }); const { eventId, orderId, status, paymentRef } = req.body || {}; if (!eventId || !orderId)
    return res.status(400).json({ error: 'Missing eventId/orderId' }); const c = await db_1.pool.connect(); try {
    await c.query('BEGIN');
    const log = await c.query("INSERT INTO webhook_logs(provider,event_id,signature_valid,payload) VALUES('mock-pay',$1,true,$2) ON CONFLICT DO NOTHING RETURNING id", [eventId, req.body]);
    if (!log.rowCount) {
        await c.query('COMMIT');
        return res.json({ received: true, duplicate: true });
    }
    const found = await c.query('SELECT * FROM orders WHERE public_id=$1 FOR UPDATE', [orderId]);
    if (!found.rowCount) {
        await c.query('COMMIT');
        return res.status(404).json({ error: 'Order not found' });
    }
    const o = found.rows[0];
    if (status === 'PAID' && o.state === 'PENDING_PAYMENT') {
        if (new Date(o.expires_at) < new Date()) {
            await c.query('UPDATE orders SET state=\'NEEDS_REVIEW\',payment_ref=$2 WHERE id=$1', [o.id, paymentRef]);
            await c.query("INSERT INTO order_events(order_id,from_state,to_state,event_type) VALUES($1,'PENDING_PAYMENT','NEEDS_REVIEW','LATE_PAYMENT')", [o.id]);
        }
        else {
            (0, state_machine_1.assertTransition)(o.state, 'PAID');
            await c.query("UPDATE orders SET state='PAID',payment_ref=$2,updated_at=now() WHERE id=$1", [o.id, paymentRef]);
            await c.query("INSERT INTO order_events(order_id,from_state,to_state,event_type) VALUES($1,'PENDING_PAYMENT','PAID','PAYMENT_CONFIRMED')", [o.id]);
            await c.query('INSERT INTO jobs(order_id) VALUES($1) ON CONFLICT DO NOTHING', [o.id]);
            if (o.voucher_code)
                await c.query('UPDATE vouchers SET reserved_count=reserved_count-1,used_count=used_count+1 WHERE code=$1', [o.voucher_code]);
        }
    }
    else if (status === 'FAILED' && o.state === 'PENDING_PAYMENT') {
        await c.query("UPDATE orders SET state='FAILED' WHERE id=$1", [o.id]);
        await c.query("INSERT INTO order_events(order_id,from_state,to_state,event_type) VALUES($1,'PENDING_PAYMENT','FAILED','PAYMENT_FAILED')", [o.id]);
    }
    await c.query('COMMIT');
    res.json({ received: true });
}
catch (e) {
    await c.query('ROLLBACK');
    res.status(500).json({ error: 'Webhook processing failed' });
}
finally {
    c.release();
} });
// Periodic expiry sweep: lock rows, release stock/voucher reservation once, append event atomically.
setInterval(async () => { const c = await db_1.pool.connect(); try {
    await c.query('BEGIN');
    const expired = await c.query("SELECT * FROM orders WHERE state='PENDING_PAYMENT' AND expires_at<=now() FOR UPDATE SKIP LOCKED LIMIT 100");
    for (const o of expired.rows) {
        (0, state_machine_1.assertTransition)('PENDING_PAYMENT', 'EXPIRED');
        await c.query("UPDATE orders SET state='EXPIRED',updated_at=now() WHERE id=$1", [o.id]);
        await c.query('UPDATE products SET stock=stock+$1 WHERE id=$2', [o.quantity, o.product_id]);
        if (o.voucher_code)
            await c.query('UPDATE vouchers SET reserved_count=GREATEST(0,reserved_count-1) WHERE code=$1', [o.voucher_code]);
        await c.query("INSERT INTO order_events(order_id,from_state,to_state,event_type) VALUES($1,'PENDING_PAYMENT','EXPIRED','PAYMENT_TIMEOUT')", [o.id]);
    }
    await c.query('COMMIT');
}
catch (e) {
    try {
        await c.query('ROLLBACK');
    }
    catch { }
    console.error('expiry sweep failed', e);
}
finally {
    c.release();
} }, 15000);
app.listen(3000, () => console.log('InBlack API listening on 3000'));
