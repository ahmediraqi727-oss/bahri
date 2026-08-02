import { supabase } from "./supabase-client";
import { Order, CartItem } from "./order-types";

export async function createOrderAndNotify(data: {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: CartItem[];
  total: number;
  deliveryFee?: number;
  deliveryDuration?: string;
  notes?: string;
  platform: string;
}): Promise<Order> {
  const orderId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const platformNote = `منصة التواصل: ${data.platform}`;
  const fullNotes = data.notes && data.notes.trim() ? `${data.notes.trim()} | ${platformNote}` : platformNote;

  const orderData: Order = {
    id: orderId,
    customerName: data.customerName.trim(),
    customerPhone: data.customerPhone.trim(),
    customerAddress: data.customerAddress.trim(),
    items: data.items,
    total: data.total,
    deliveryFee: data.deliveryFee ?? 0,
    deliveryDuration: data.deliveryDuration || "",
    status: "pending",
    notes: fullNotes,
    platform: data.platform,
    createdAt,
  };

  // 1. Insert order into Supabase database
  const { error: orderErr } = await supabase.from("orders").insert({
    id: orderData.id,
    customer_name: orderData.customerName,
    customer_phone: orderData.customerPhone,
    customer_address: orderData.customerAddress,
    items: orderData.items,
    total: orderData.total,
    delivery_fee: orderData.deliveryFee,
    delivery_duration: orderData.deliveryDuration,
    status: orderData.status,
    notes: orderData.notes,
    created_at: orderData.createdAt,
  });

  if (orderErr) {
    console.error("Supabase insert order error:", orderErr.message);
  }

  // 2. Insert notification into Supabase notifications table
  const platformIcon = data.platform.includes("واتساب")
    ? "💬"
    : data.platform.includes("تليجرام")
    ? "✈️"
    : data.platform.includes("ماسنجر")
    ? "⚡"
    : "📞";

  await supabase.from("notifications").insert({
    id: crypto.randomUUID(),
    type: "info",
    title: `${platformIcon} طلب جديد عبر (${data.platform})`,
    message: `طلب بقيمة ${orderData.total.toLocaleString()} د.ع من ${orderData.customerName} (هاتف: ${orderData.customerPhone} | العنوان: ${orderData.customerAddress})`,
    product_id: orderData.id,
    read: false,
    created_at: createdAt,
  });

  return orderData;
}
