"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertTransition = assertTransition;
const transitions = {
    PENDING_PAYMENT: ['PAID', 'EXPIRED', 'FAILED', 'NEEDS_REVIEW'], PAID: ['IN_QUEUE', 'REFUNDED', 'NEEDS_REVIEW'],
    IN_QUEUE: ['IN_PROGRESS', 'FAILED', 'NEEDS_REVIEW', 'REFUNDED'], IN_PROGRESS: ['COMPLETED', 'FAILED', 'NEEDS_REVIEW'],
    COMPLETED: [], EXPIRED: [], FAILED: ['REFUNDED', 'NEEDS_REVIEW'], REFUNDED: [], NEEDS_REVIEW: ['IN_QUEUE', 'REFUNDED', 'FAILED']
};
function assertTransition(from, to) { if (!transitions[from].includes(to))
    throw new Error(`Illegal order transition: ${from} -> ${to}`); }
