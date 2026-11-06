"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const node_crypto_1 = require("node:crypto");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const secret = process.env.WEBHOOK_SECRET || 'local-webhook-secret-change-me';
app.post('/pay', async (req, res) => { const eventId = (0, node_crypto_1.randomUUID)(); const payload = { eventId, orderId: req.body.orderId, status: 'PAID', paymentRef: `mock-${eventId}` }; const signature = (0, node_crypto_1.createHmac)('sha256', secret).update(JSON.stringify(payload)).digest('hex'); try {
    const r = await fetch('http://api:3000/api/webhooks/mock-pay', { method: 'POST', headers: { 'content-type': 'application/json', 'X-IBM-Signature': signature }, body: JSON.stringify(payload) });
    res.status(200).json({ mockPayment: 'PAID', webhookStatus: r.status, payload });
}
catch {
    res.status(202).json({ mockPayment: 'PAID', payload });
} });
app.listen(4001, () => console.log('mock-pay on 4001'));
