/** Shared shapes for customer-facing order data (GET /orders/me and /orders/:id). */

export interface OrderItemDetail {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product?: {
    name: string;
    slug: string;
    images?: { url: string }[];
  };
  variant?: { name: string; sku: string } | null;
}

export interface PaymentDetail {
  id: string;
  provider: string;
  providerPaymentId?: string | null;
  amount: number;
  currency: string;
  status: string; // PENDING | CAPTURED | FAILED | REFUNDED | PARTIALLY_REFUNDED
  method?: string | null;
  capturedAt?: string | null;
  createdAt: string;
}

export interface TrackingEventDetail {
  id: string;
  status: string;
  location?: string | null;
  description: string;
  timestamp: string;
  source: string;
}

export interface ShipmentDetail {
  id: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  status: string; // PENDING | IN_TRANSIT | DELIVERED | FAILED | RETURNED
  shippedAt?: string | null;
  deliveredAt?: string | null;
  trackingEvents: TrackingEventDetail[];
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  shippingCost: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  _count?: { items: number };
  items?: OrderItemDetail[];
}

export interface OrderListResponse {
  data: OrderSummary[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface OrderDetail extends OrderSummary {
  email: string;
  shippingAddress: string; // JSON string
  billingAddress: string;
  notes?: string | null;
  items: OrderItemDetail[];
  payments: PaymentDetail[];
  shipments: ShipmentDetail[];
  user?: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
}

/** Statuses the backend's POST /orders/:id/cancel allows (orders.service.ts). */
export const CANCELLABLE_STATUSES = new Set([
  'PENDING',
  'PAYMENT_PENDING',
  'PAID',
  'PROCESSING',
]);

export function isOrderCancellable(status: string): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

/** Human-readable order status labels. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PAYMENT_PENDING: 'Awaiting payment',
  PAID: 'Paid',
  PROCESSING: 'Processing',
  FULFILLMENT: 'Being fulfilled',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  FAILED: 'Failed',
  RETURNED: 'Returned',
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** Human-readable payment status labels. */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  AUTHORIZED: 'Authorized',
  CAPTURED: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

/** Overall payment status for an order: highest-signal status across its payments. */
export function paymentStatus(order: OrderDetail): string {
  if (!order.payments || order.payments.length === 0) return 'NONE';
  const statuses = order.payments.map((p) => p.status);
  if (statuses.some((s) => s === 'CAPTURED')) return 'CAPTURED';
  if (statuses.some((s) => s === 'REFUNDED')) return 'REFUNDED';
  if (statuses.some((s) => s === 'PARTIALLY_REFUNDED')) return 'PARTIALLY_REFUNDED';
  if (statuses.some((s) => s === 'FAILED')) return 'FAILED';
  if (statuses.some((s) => s === 'AUTHORIZED')) return 'AUTHORIZED';
  return 'PENDING';
}

/** Parse the stored shippingAddress JSON into a record. */
export function parseAddress(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
