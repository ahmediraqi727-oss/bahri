export interface CartItem {
  productId: string;
  name: string;
  image: string;
  /** Original base retail price (never changes after add-to-cart) */
  retailPrice: number;
  /** Original wholesale price stored for reference */
  wholesalePrice?: number;
  quantity: number;
  /** Resolved unit price after applying the active tier discount */
  appliedTierPrice: number;
  /** Human-readable tier label, e.g. "جملة 1 — خصم 2%" */
  appliedTierLabel: string;
}

export interface Order {
  id: string;
  serialNumber?: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: CartItem[];
  total: number;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  notes: string;
  platform?: string;
  deliveryFee?: number;
  deliveryDuration?: string;
  createdAt: string;
}

export function formatInvoiceSerial(order: { id: string; serialNumber?: number; createdAt?: string }): string {
  const year = order.createdAt ? new Date(order.createdAt).getFullYear() : 2026;
  if (order.serialNumber) {
    const padded = String(order.serialNumber).padStart(4, "0");
    return `INV-${year}-${padded}`;
  }
  // Fallback to formatted ID substring
  const cleanId = (order.id || "").replace(/\D/g, "");
  const numPart = cleanId ? cleanId.substring(0, 4) : order.id.substring(0, 4).toUpperCase();
  return `INV-${year}-${numPart}`;
}
