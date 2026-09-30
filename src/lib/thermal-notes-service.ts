/**
 * thermal-notes-service.ts
 *
 * Backend & Client Integration Service for Ahmed Bahri Thermal Studio Footer Notes.
 * Integrates with Supabase (`thermal_footer_notes` table) with resilient offline local fallback.
 */

import { supabase } from "@/lib/supabase-client";

export interface ThermalFooterNote {
  id: string;
  note_text: string;
  is_default?: boolean;
  user_id?: string | null;
  created_at?: string;
}

export const DEFAULT_PRESET_FOOTER_NOTES: ThermalFooterNote[] = [
  {
    id: "default-note-1",
    note_text: "معرض أحمد بحري",
    is_default: true,
    created_at: new Date(2026, 0, 1).toISOString(),
  },
  {
    id: "default-note-2",
    note_text: "معرض أحمد بحري - قطع غيار السيارات الأصلية",
    is_default: false,
    created_at: new Date(2026, 0, 2).toISOString(),
  },
  {
    id: "default-note-3",
    note_text: "معرض أحمد بحري - ضمان الجودة والفحص الفني",
    is_default: false,
    created_at: new Date(2026, 0, 3).toISOString(),
  },
  {
    id: "default-note-4",
    note_text: "بضاعة مباعة لا ترد ولا تستبدل بعد 3 أيام",
    is_default: false,
    created_at: new Date(2026, 0, 4).toISOString(),
  },
  {
    id: "default-note-5",
    note_text: "خدمة العملاء والاستفسارات: 07700000000",
    is_default: false,
    created_at: new Date(2026, 0, 5).toISOString(),
  },
  {
    id: "default-note-6",
    note_text: "ملاحظة: السعر شامل الضريبة والمطابقة الفنية",
    is_default: false,
    created_at: new Date(2026, 0, 6).toISOString(),
  },
];

const LOCAL_STORAGE_KEY = "ahmed_bahri_thermal_footer_notes_cache";

function getLocalCachedNotes(): ThermalFooterNote[] {
  if (typeof window === "undefined") return DEFAULT_PRESET_FOOTER_NOTES;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return DEFAULT_PRESET_FOOTER_NOTES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PRESET_FOOTER_NOTES;
}

function saveLocalCachedNotes(notes: ThermalFooterNote[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * SELECT query: Fetches all saved thermal footer notes from Supabase.
 * Seamlessly falls back to local storage cache if table does not exist yet or network fails.
 */
export async function fetchFooterNotes(): Promise<{
  notes: ThermalFooterNote[];
  fromDatabase: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from("thermal_footer_notes")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      // Merge with default items to ensure key presets are always present
      const existingTexts = new Set(data.map((d) => d.note_text.trim()));
      const merged: ThermalFooterNote[] = [...data];

      for (const def of DEFAULT_PRESET_FOOTER_NOTES) {
        if (!existingTexts.has(def.note_text.trim())) {
          merged.push(def);
        }
      }

      saveLocalCachedNotes(merged);
      return { notes: merged, fromDatabase: true };
    }
  } catch (err) {
    console.warn("[ThermalNotesService] Supabase fetch fallback to local cache:", err);
  }

  // Fallback to local storage cache + presets
  return { notes: getLocalCachedNotes(), fromDatabase: false };
}

/**
 * INSERT query: Saves a new thermal footer note into Supabase.
 * Updates local cache immediately and returns the created note.
 */
export async function createFooterNote(
  noteText: string,
  userId?: string | null
): Promise<{ note: ThermalFooterNote; savedToDatabase: boolean }> {
  const trimmed = noteText.trim();
  if (!trimmed) {
    throw new Error("لا يمكن حفظ ملاحظة فارغة");
  }

  const newId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `note-${Date.now()}`;

  const localNote: ThermalFooterNote = {
    id: newId,
    note_text: trimmed,
    is_default: false,
    user_id: userId || null,
    created_at: new Date().toISOString(),
  };

  let savedToDatabase = false;

  try {
    const payload: { note_text: string; user_id?: string | null } = {
      note_text: trimmed,
    };
    if (userId) payload.user_id = userId;

    const { data, error } = await supabase
      .from("thermal_footer_notes")
      .insert([payload])
      .select()
      .single();

    if (!error && data) {
      localNote.id = data.id;
      localNote.created_at = data.created_at;
      savedToDatabase = true;
    }
  } catch (err) {
    console.warn("[ThermalNotesService] Supabase insert failed, saved to local cache:", err);
  }

  // Update local cache
  const current = getLocalCachedNotes();
  const exists = current.some(
    (n) => n.note_text.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (!exists) {
    const updated = [localNote, ...current];
    saveLocalCachedNotes(updated);
  }

  return { note: localNote, savedToDatabase };
}

/**
 * DELETE query: Deletes a note from Supabase and local cache.
 */
export async function deleteFooterNote(id: string): Promise<boolean> {
  let deletedFromDatabase = false;
  try {
    const { error } = await supabase
      .from("thermal_footer_notes")
      .delete()
      .eq("id", id);
    if (!error) {
      deletedFromDatabase = true;
    }
  } catch (err) {
    console.warn("[ThermalNotesService] Supabase delete error:", err);
  }

  const current = getLocalCachedNotes();
  const updated = current.filter((n) => n.id !== id);
  saveLocalCachedNotes(updated);

  return deletedFromDatabase;
}
