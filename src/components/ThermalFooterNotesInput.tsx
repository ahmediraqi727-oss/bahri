"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchFooterNotes,
  createFooterNote,
  deleteFooterNote,
  ThermalFooterNote,
  DEFAULT_PRESET_FOOTER_NOTES,
} from "@/lib/thermal-notes-service";

interface ThermalFooterNotesInputProps {
  value: string;
  onChange: (newValue: string) => void;
  userId?: string | null;
}

export default function ThermalFooterNotesInput({
  value,
  onChange,
  userId,
}: ThermalFooterNotesInputProps) {
  const [savedNotes, setSavedNotes] = useState<ThermalFooterNote[]>(DEFAULT_PRESET_FOOTER_NOTES);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(false);

  // Load notes from Supabase (with resilient local fallback)
  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const { notes, fromDatabase } = await fetchFooterNotes();
      setSavedNotes(notes);
      setIsDbConnected(fromDatabase);
    } catch {
      setSavedNotes(DEFAULT_PRESET_FOOTER_NOTES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Check if current text is already saved in the list
  const isAlreadySaved = useMemo(() => {
    const trimmed = (value || "").trim().toLowerCase();
    if (!trimmed) return true;
    return savedNotes.some((n) => n.note_text.trim().toLowerCase() === trimmed);
  }, [value, savedNotes]);

  // Find note ID if currently matching a saved note
  const matchedNote = useMemo(() => {
    const trimmed = (value || "").trim().toLowerCase();
    if (!trimmed) return null;
    return savedNotes.find((n) => n.note_text.trim().toLowerCase() === trimmed) || null;
  }, [value, savedNotes]);

  // Temporary feedback alert
  const showFeedback = (text: string, type: "success" | "info" | "error" = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 3000);
  };

  // Handle dropdown selection
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedText = e.target.value;
    if (selectedText === "__CUSTOM_NEW__") {
      onChange("");
      return;
    }
    if (selectedText) {
      onChange(selectedText);
      showFeedback("تم اختيار الملاحظة بنجاح ✓", "info");
    }
  };

  // Handle saving new note to database
  const handleSaveNewNote = async () => {
    const trimmed = (value || "").trim();
    if (!trimmed) {
      showFeedback("يرجى كتابة نص الملاحظة أولاً قبل الحفظ", "error");
      return;
    }

    if (isAlreadySaved) {
      showFeedback("هذه الملاحظة محفوظة مسبقاً في القائمة", "info");
      return;
    }

    setIsSaving(true);
    try {
      const { note, savedToDatabase } = await createFooterNote(trimmed, userId);
      setSavedNotes((prev) => [note, ...prev]);
      if (savedToDatabase) {
        showFeedback("تم حفظ الملاحظة الجديدة في قاعدة البيانات (Supabase) بنجاح ✓", "success");
      } else {
        showFeedback("تم حفظ الملاحظة محلياً في المتصفح بنجاح ✓", "success");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذر حفظ الملاحظة";
      showFeedback(msg, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle deleting a note
  const handleDeleteCurrentNote = async () => {
    if (!matchedNote) return;
    if (matchedNote.is_default) {
      showFeedback("لا يمكن حذف الملاحظة الافتراضية للنظام", "error");
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف الملاحظة: "${matchedNote.note_text}"؟`)) {
      return;
    }

    try {
      await deleteFooterNote(matchedNote.id);
      setSavedNotes((prev) => prev.filter((n) => n.id !== matchedNote.id));
      showFeedback("تم حذف الملاحظة من القائمة بنجاح", "info");
    } catch {
      showFeedback("حدث خطأ أثناء محاولة الحذف", "error");
    }
  };

  return (
    <div className="pt-2.5 border-t border-purple-900/60 text-xs space-y-2.5 font-sans" dir="rtl">
      {/* Title & Connection Status */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-purple-200 font-bold">
          <span>✍️ نص التذييل والملاحظات:</span>
          {isDbConnected ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Supabase متصل
            </span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-900/40 border border-purple-500/30 text-purple-300">
              ملاحظات مدمجة
            </span>
          )}
        </label>

        {statusMessage && (
          <span
            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg animate-in fade-in duration-200 ${
              statusMessage.type === "success"
                ? "bg-emerald-900/70 text-emerald-200 border border-emerald-500/40"
                : statusMessage.type === "error"
                ? "bg-red-900/70 text-red-200 border border-red-500/40"
                : "bg-blue-900/70 text-blue-200 border border-blue-500/40"
            }`}
          >
            {statusMessage.text}
          </span>
        )}
      </div>

      {/* 1. Dropdown Select from Saved Notes */}
      <div className="relative">
        <select
          value={matchedNote ? matchedNote.note_text : "__CUSTOM_NEW__"}
          onChange={handleSelectChange}
          disabled={loading}
          className="w-full px-3 py-2 bg-[#191136] hover:bg-[#201545] border border-purple-500/40 focus:border-purple-400 rounded-xl text-xs text-purple-100 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all cursor-pointer appearance-none pr-8"
          title="اختر من الملاحظات المحفوظة مسبقاً في قاعدة البيانات"
        >
          <option value="__CUSTOM_NEW__" className="bg-purple-950 text-purple-300">
            {value.trim() && !isAlreadySaved
              ? "✎ نص مخصص جديد (غير محفوظ بعد - اضغط + للحفظ)..."
              : "-- اختر من الملاحظات المحفوظة أو اكتب نصاً جديداً --"}
          </option>
          {savedNotes.map((note) => (
            <option
              key={note.id}
              value={note.note_text}
              className="bg-purple-950 text-white py-1"
            >
              {note.is_default ? "⭐ " : "📌 "}
              {note.note_text}
            </option>
          ))}
        </select>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-purple-400 text-xs">
          ▼
        </div>
      </div>

      {/* 2. Composite Editable Input + Save (+) / Delete Buttons */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="اكتب نص الملاحظة هنا، أو اختر من القائمة أعلاه..."
            className="w-full px-3 py-2 bg-purple-950/80 border border-purple-500/40 focus:border-purple-400 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all"
          />
        </div>

        {/* Add / Save Button */}
        <button
          type="button"
          onClick={handleSaveNewNote}
          disabled={isSaving || isAlreadySaved || !value.trim()}
          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shrink-0 border shadow-sm ${
            isAlreadySaved
              ? "bg-purple-900/40 text-purple-400 border-purple-800/40 cursor-default opacity-80"
              : value.trim()
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-400/60 shadow-emerald-900/30 active:scale-95"
              : "bg-purple-900/30 text-purple-400 border-purple-800/30 cursor-not-allowed opacity-50"
          }`}
          title={
            isAlreadySaved
              ? "هذه الملاحظة محفوظة مسبقاً"
              : "حفظ هذا النص كملاحظة جديدة في قاعدة البيانات (Supabase)"
          }
        >
          {isSaving ? (
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isAlreadySaved ? (
            <>
              <span className="text-emerald-400">✓</span>
              <span className="hidden sm:inline">محفوظة</span>
            </>
          ) : (
            <>
              <span className="text-sm font-extrabold">+</span>
              <span>حفظ بقاعدة البيانات</span>
            </>
          )}
        </button>

        {/* Optional Delete Note Button (For custom non-default notes) */}
        {matchedNote && !matchedNote.is_default && (
          <button
            type="button"
            onClick={handleDeleteCurrentNote}
            className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 hover:border-red-600 transition-all shrink-0 active:scale-95"
            title="حذف هذه الملاحظة من قاعدة البيانات"
          >
            🗑️
          </button>
        )}
      </div>

      {/* 3. Fast Preset Chips (Top common selections for fast 1-click apply) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-purple-300 font-bold shrink-0">ملاحظات شائعة سريعة:</span>
        {savedNotes.slice(0, 4).map((note) => {
          const isSelected = (value || "").trim() === note.note_text.trim();
          return (
            <button
              key={note.id}
              type="button"
              onClick={() => onChange(note.note_text)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                isSelected
                  ? "bg-purple-700 text-white border-purple-400 shadow-xs"
                  : "bg-purple-950/60 hover:bg-purple-900/60 text-purple-200 border-purple-800/60 hover:border-purple-600"
              }`}
            >
              {note.note_text.length > 28 ? `${note.note_text.substring(0, 28)}...` : note.note_text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
