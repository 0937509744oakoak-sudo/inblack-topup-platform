"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.post('/topup', (req, res) => { if (process.env.MOCK_GAME_FAIL === 'true')
    return res.status(503).json({ ok: false }); res.json({ ok: true, orderId: req.body.orderId, providerRef: `game-${req.body.orderId}` }); });
app.listen(4002, () => console.log('mock-game on 4002'));
