import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { DEFAULT_PRESET_FOOTER_NOTES } from "@/lib/thermal-notes-service";

/**
 * GET /api/thermal-notes
 * Fetches all saved thermal footer notes from Supabase.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("thermal_footer_notes")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, notes: DEFAULT_PRESET_FOOTER_NOTES, error: error.message },
        { status: 200 } // return 200 with fallback to prevent client crash
      );
    }

    return NextResponse.json({ success: true, notes: data || DEFAULT_PRESET_FOOTER_NOTES });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { success: false, notes: DEFAULT_PRESET_FOOTER_NOTES, error: msg },
      { status: 200 }
    );
  }
}

/**
 * POST /api/thermal-notes
 * Saves a new thermal footer note to Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { note_text, user_id } = body;

    const trimmed = typeof note_text === "string" ? note_text.trim() : "";
    if (!trimmed) {
      return NextResponse.json(
        { success: false, error: "نص الملاحظة مطلوب ولا يمكن أن يكون فارغاً" },
        { status: 400 }
      );
    }

    const payload: { note_text: string; user_id?: string | null } = {
      note_text: trimmed,
    };
    if (user_id) payload.user_id = user_id;

    const { data, error } = await supabase
      .from("thermal_footer_notes")
      .insert([payload])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, note: data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/thermal-notes
 * Deletes a note by ID.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "معرّف الملاحظة (ID) مطلوب" }, { status: 400 });
    }

    const { error } = await supabase.from("thermal_footer_notes").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
