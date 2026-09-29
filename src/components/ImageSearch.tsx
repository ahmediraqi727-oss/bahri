"use client";

import { useState, useRef, useCallback } from "react";

interface ImageSearchProps {
  onResults: (results: { id: string; score: number }[]) => void;
  onClear: () => void;
  isSearching: boolean;
}

// Fallback local color histogram matching in case API key is missing or offline
function extractColors(img: HTMLImageElement): number[] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const size = 32;
  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const bins = new Array(64).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.floor(data[i] / 32);
    const g = Math.floor(data[i + 1] / 32);
    const b = Math.floor(data[i + 2] / 32);
    bins[r * 16 + g * 4 + b]++;
  }
  const total = size * size;
  return bins.map((b) => b / total);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-10);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function ImageSearch({ onResults, onClear, isSearching }: ImageSearchProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [identifiedPart, setIdentifiedPart] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Local color comparison fallback
  const runLocalFallbackSearch = useCallback(async (dataUrl: string) => {
    try {
      const queryImg = await loadImage(dataUrl);
      const queryColors = extractColors(queryImg);
      const productImages = document.querySelectorAll("[data-product-image]");
      const scores: { id: string; score: number }[] = [];

      for (const el of Array.from(productImages)) {
        const id = el.getAttribute("data-product-id") || "";
        const src = el.getAttribute("src") || "";
        if (!src || src.startsWith("data:")) continue;
        try {
          const img = await loadImage(src);
          const colors = extractColors(img);
          const score = cosineSimilarity(queryColors, colors);
          scores.push({ id, score: score * 100 });
        } catch { /* skip */ }
      }

      scores.sort((a, b) => b.score - a.score);
      onResults(scores.filter((s) => s.score > 30));
    } catch (err) {
      console.warn("Local fallback search error:", err);
    }
  }, [onResults]);

  const analyzeImageWithGemini = useCallback(async (file: File) => {
    setAnalyzing(true);
    setIdentifiedPart(null);
    setNoticeMessage(null);
    setStatusMessage("جاري قراءة الصورة...");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setStatusMessage("جاري فحص القطعة بالذكاء الاصطناعي (Gemini Vision)...");

      try {
        const res = await fetch("/api/visual-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
        });

        const json = await res.json().catch(() => ({}));

        if (json.requiresApiKey) {
          // Alert user that Gemini API key can be set in dashboard settings
          setNoticeMessage(
            "💡 للبحث الفائق عبر Google Gemini Vision، يرجى حفظ مفتاح الـ API في [لوحة التحكم > الإعدادات]. تم استخدام البحث البصري المحلي مؤقتاً."
          );
          setStatusMessage("تم استخدام الفحص البصري البديل");
          await runLocalFallbackSearch(dataUrl);
          setAnalyzing(false);
          return;
        }

        if (json.success && json.data) {
          const { identifiedPart: partName, category, matches = [] } = json.data;
          if (partName) {
            setIdentifiedPart(`${partName} (${category || "قطع غيار"})`);
          }

          if (matches && matches.length > 0) {
            const formattedScores = matches.map((m: { id: string; score: number }) => ({
              id: m.id,
              score: m.score,
            }));
            onResults(formattedScores);
            setStatusMessage(`تم العثور على ${matches.length} تطابق ذكي`);
          } else {
            // Fallback to local matching if no Gemini matches found
            await runLocalFallbackSearch(dataUrl);
            setStatusMessage("تم فحص المنتجات ومطابقتها");
          }
        } else {
          // Fallback to local color match
          await runLocalFallbackSearch(dataUrl);
          setStatusMessage("تم الفحص بنجاح");
        }
      } catch (err) {
        console.error("Visual search request error:", err);
        setNoticeMessage("⚠️ تعذر الاتصال بسيرفر الذكاء الاصطناعي، تم تفعيل البحث البصري المحلي.");
        await runLocalFallbackSearch(dataUrl);
        setStatusMessage("تم البحث البصري البديل");
      } finally {
        setAnalyzing(false);
      }
    };

    reader.readAsDataURL(file);
  }, [onResults, runLocalFallbackSearch]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzeImageWithGemini(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) analyzeImageWithGemini(file);
  };

  const clear = () => {
    setPreview(null);
    setAnalyzing(false);
    setIdentifiedPart(null);
    setNoticeMessage(null);
    setStatusMessage("");
    onClear();
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  return (
    <div className="relative flex flex-col gap-1.5" dir="rtl">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />

      {preview ? (
        <div className="flex flex-col gap-1.5 bg-white dark:bg-gray-900 p-2 rounded-2xl border border-violet-200 dark:border-violet-900 shadow-md">
          <div className="flex items-center gap-2.5">
            {/* Image Thumbnail with Spinner */}
            <div className="relative flex-shrink-0">
              <img
                src={preview}
                alt="معاينة الصورة"
                className="w-12 h-12 rounded-xl object-cover border-2 border-violet-500 shadow-sm"
              />
              {analyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Status & Identified Part */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-violet-700 dark:text-violet-300 truncate">
                  {analyzing ? (
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-violet-600 animate-ping" />
                      <span>{statusMessage}</span>
                    </span>
                  ) : (
                    <span>{statusMessage || "تم فحص الصورة"}</span>
                  )}
                </span>
              </div>

              {identifiedPart && (
                <p className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                  ✨ تم التعرف: {identifiedPart}
                </p>
              )}
            </div>

            {/* Clear Button */}
            <button
              onClick={clear}
              className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
              title="إلغاء البحث بالصورة"
            >
              ✕
            </button>
          </div>

          {/* Info Notice Banner if needed */}
          {noticeMessage && (
            <div className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded-lg border border-amber-200 dark:border-amber-800 leading-tight">
              {noticeMessage}
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700"
        >
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
            title="تصوير قطعة غيار بالكاميرا"
          >
            <span>📷</span>
            <span className="hidden sm:inline">كاميرا</span>
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
            title="اختيار صورة قطعة غيار من الجهاز"
          >
            <span>✨</span>
            <span>بحث بالصورة</span>
          </button>
        </div>
      )}
    </div>
  );
}
