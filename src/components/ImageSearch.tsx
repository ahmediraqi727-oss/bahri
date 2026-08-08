"use client";

import { useState, useRef, useCallback } from "react";

interface ImageSearchProps {
  onResults: (results: { id: string; score: number }[]) => void;
  onClear: () => void;
  isSearching: boolean;
}

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
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const analyzeImage = useCallback(async (file: File) => {
    setAnalyzing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
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
            scores.push({ id, score });
          } catch { /* skip */ }
        }

        scores.sort((a, b) => b.score - a.score);
        onResults(scores.filter((s) => s.score > 0.3));
      } catch { /* ignore */ }
      setAnalyzing(false);
    };
    reader.readAsDataURL(file);
  }, [onResults]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzeImage(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) analyzeImage(file);
  };

  const clear = () => {
    setPreview(null);
    setAnalyzing(false);
    onClear();
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  return (
    <div className="relative">
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
        <div className="flex items-center gap-2">
          <div className="relative">
            <img src={preview} alt="البحث بالصورة" className="w-10 h-10 rounded-lg object-cover border-2 border-blue-500" />
            {analyzing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {analyzing ? "جاري التحليل بالذكاء الاصطناعي..." : "تم التحليل"}
            </p>
          </div>
          <button
            onClick={clear}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700"
        >
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
            title="تصوير منتج بالكاميرا"
          >
            <span>📷</span>
            <span className="hidden sm:inline">كاميرا</span>
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
            title="اختيار صورة من الجهاز"
          >
            <span>📁</span>
            <span>بحث بالصورة</span>
          </button>
        </div>
      )}
    </div>
  );
}
