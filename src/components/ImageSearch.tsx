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
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all text-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>ابحث بالصورة</span>
        </button>
      )}
    </div>
  );
}
