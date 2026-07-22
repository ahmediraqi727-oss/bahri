export interface CartItem {
  productId: string;
  name: string;
  image: string;
  retailPrice: number;
  quantity: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: CartItem[];
  total: number;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  notes: string;
  createdAt: string;
}
