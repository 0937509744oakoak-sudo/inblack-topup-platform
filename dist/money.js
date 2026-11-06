"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializePrice = void 0;
exports.calculatePrice = calculatePrice;
const ceilDiv = (n, d) => (n + d - 1n) / d;
function calculatePrice(i) {
    if (i.unitPriceSatang < 0n || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.vatBps < 0n)
        throw new Error('Invalid price input');
    const subtotalSatang = i.unitPriceSatang * BigInt(i.quantity);
    const discountSatang = i.discountSatang ?? 0n;
    if (discountSatang < 0n || discountSatang > subtotalSatang)
        throw new Error('Discount exceeds subtotal');
    const netSatang = subtotalSatang - discountSatang;
    const feeSatang = i.method === 'PROMPTPAY' ? 0n : i.method === 'TRUEMONEY' ? ceilDiv(netSatang * 150n, 10000n) : ceilDiv(netSatang * 290n, 10000n) + 30000n;
    const totalSatang = netSatang + feeSatang;
    // VAT is 7% of total here; half-up is integer-only.
    const vatSatang = (totalSatang * i.vatBps * 2n + 10000n) / 20000n;
    return { subtotalSatang, discountSatang, netSatang, feeSatang, totalSatang, vatSatang };
}
const serializePrice = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.toString()]));
exports.serializePrice = serializePrice;
