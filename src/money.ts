export type PaymentMethod = 'PROMPTPAY' | 'TRUEMONEY' | 'CARD';
export interface PriceInput { unitPriceSatang: bigint; quantity: number; discountSatang?: bigint; method: PaymentMethod; vatBps: bigint }
export interface Price { subtotalSatang: bigint; discountSatang: bigint; netSatang: bigint; feeSatang: bigint; totalSatang: bigint; vatSatang: bigint }
const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;
export function calculatePrice(i: PriceInput): Price {
  if (i.unitPriceSatang < 0n || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.vatBps < 0n) throw new Error('Invalid price input');
  const subtotalSatang = i.unitPriceSatang * BigInt(i.quantity);
  const discountSatang = i.discountSatang ?? 0n;
  if (discountSatang < 0n || discountSatang > subtotalSatang) throw new Error('Discount exceeds subtotal');
  const netSatang = subtotalSatang - discountSatang;
  const feeSatang = i.method === 'PROMPTPAY' ? 0n : i.method === 'TRUEMONEY' ? ceilDiv(netSatang * 150n, 10000n) : ceilDiv(netSatang * 290n, 10000n) + 30000n;
  const totalSatang = netSatang + feeSatang;
  // VAT is 7% of total here; half-up is integer-only.
  const vatSatang = (totalSatang * i.vatBps * 2n + 10000n) / 20000n;
  return { subtotalSatang, discountSatang, netSatang, feeSatang, totalSatang, vatSatang };
}
export const serializePrice = (p: Price) => Object.fromEntries(Object.entries(p).map(([k,v]) => [k, v.toString()]));
