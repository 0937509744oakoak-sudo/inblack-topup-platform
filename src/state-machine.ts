export type OrderState = 'PENDING_PAYMENT'|'PAID'|'IN_QUEUE'|'IN_PROGRESS'|'COMPLETED'|'EXPIRED'|'FAILED'|'REFUNDED'|'NEEDS_REVIEW';
const transitions: Record<OrderState, OrderState[]> = {
  PENDING_PAYMENT:['PAID','EXPIRED','FAILED','NEEDS_REVIEW'], PAID:['IN_QUEUE','REFUNDED','NEEDS_REVIEW'],
  IN_QUEUE:['IN_PROGRESS','FAILED','NEEDS_REVIEW','REFUNDED'], IN_PROGRESS:['COMPLETED','FAILED','NEEDS_REVIEW'],
  COMPLETED:[], EXPIRED:[], FAILED:['REFUNDED','NEEDS_REVIEW'], REFUNDED:[], NEEDS_REVIEW:['IN_QUEUE','REFUNDED','FAILED']
};
export function assertTransition(from: OrderState, to: OrderState): void { if (!transitions[from].includes(to)) throw new Error(`Illegal order transition: ${from} -> ${to}`); }
