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
  const invoiceSerial = "INV-2026-" + Math.floor(1000 + Math.random() * 9000);
  const platformNote = `منصة التواصل: ${data.platform}`;
  const fullNotes = data.notes && data.notes.trim() ? `${data.notes.trim()} | ${platformNote}` : platformNote;

  const orderData: Order = {
    id: orderId,
    invoiceSerial,
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

  // 1. Insert order into Supabase database with invoice_serial and governorate
  const { data: createdRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      id: orderData.id,
      invoice_serial: invoiceSerial,
      customer_name: orderData.customerName,
      customer_phone: orderData.customerPhone,
      customer_address: orderData.customerAddress,
      governorate: orderData.customerAddress,
      items: orderData.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        image: it.image || "",
        quantity: it.quantity,
        retailPrice: it.appliedTierPrice ?? it.retailPrice,
        appliedTierPrice: it.appliedTierPrice,
        appliedTierLabel: it.appliedTierLabel,
      })),
      total: orderData.total,
      delivery_fee: orderData.deliveryFee,
      delivery_duration: orderData.deliveryDuration,
      status: orderData.status,
      notes: orderData.notes,
      platform: orderData.platform,
      created_at: orderData.createdAt,
    })
    .select()
    .maybeSingle();

  if (orderErr) {
    console.error("Supabase insert order error:", orderErr.message);
  }

  if (createdRow) {
    if (createdRow.serial_number) {
      orderData.serialNumber = Number(createdRow.serial_number);
    }
    if (createdRow.invoice_serial) {
      orderData.invoiceSerial = createdRow.invoice_serial;
    }
  }

  // 2. Insert notification into Supabase notifications table
  const platformIcon = data.platform.includes("واتساب")
    ? "💬"
    : data.platform.includes("تليجرام")
    ? "✈️"
    : data.platform.includes("ماسنجر")
    ? "⚡"
    : "📞";

  const notifSerial = orderData.invoiceSerial || (orderData.serialNumber ? `INV-2026-${String(orderData.serialNumber).padStart(4, "0")}` : invoiceSerial);

  await supabase.from("notifications").insert({
    id: crypto.randomUUID(),
    type: "order",
    title: `${platformIcon} فاتورة طلب شراء جديدة #${notifSerial}`,
    message: `فاتورة جديدة للزبون (${orderData.customerName} - ${orderData.customerPhone}) بقيمة: ${orderData.total.toLocaleString()} د.ع`,
    product_id: orderData.id,
    is_broadcast: true,
    read: false,
    created_at: createdAt,
  });

  return orderData;
}
