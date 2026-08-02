import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      customer_name,
      customer_phone,
      customer_address,
      items,
      total,
      delivery_fee,
      delivery_duration,
      delivery_time,
      invoice_serial,
      status,
      notes,
    } = body;

    const deliveryTimeValue = delivery_time || delivery_duration || "";
    const deliveryDurationValue = delivery_duration || delivery_time || "";

    const updatePayload: Record<string, unknown> = {
      customer_name,
      customer_phone,
      customer_address,
      items,
      total,
      delivery_fee: Number(delivery_fee) || 0,
      delivery_duration: deliveryDurationValue,
      delivery_time: deliveryTimeValue,
      invoice_serial: invoice_serial || "",
      status,
      notes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[PUT /api/orders/[id]] Supabase Update Error:", error);
      return NextResponse.json({ error: error.message, details: error }, { status: 400 });
    }

    return NextResponse.json({ success: true, order: data }, { status: 200 });
  } catch (err: unknown) {
    console.error("[PUT /api/orders/[id]] Exception caught:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("[GET /api/orders/[id]] Supabase Error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ order: data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
