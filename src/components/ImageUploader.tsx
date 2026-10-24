"use client";

import { useRef, useState } from "react";
import {
  processAndUploadProductImage,
  formatByteSize,
  OptimizedImageResult,
} from "@/lib/image-optimizer";

interface ImageUploaderProps {
  label: string;
  image: string;
  onUpload: (imageUrl: string) => void;
  onUploadDetails?: (result: OptimizedImageResult) => void;
  aspect?: string;
  bucket?: string;
  className?: string;
}

export default function ImageUploader({
  label,
  image,
  onUpload,
  onUploadDetails,
  aspect = "aspect-video",
  bucket = "site-assets",
  className = "",
}: ImageUploaderProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState<{
    originalSize: number;
    optimizedSize: number;
    thumbnailSize: number;
    savingsPercent: number;
    format: string;
  } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await processAndUploadProductImage(file, {
        bucket,
        maxMainDimension: 800,
        mainQuality: 0.8,
        thumbnailSize: 200,
        thumbnailQuality: 0.76,
      });

      setStats({
        originalSize: result.originalSize,
        optimizedSize: result.optimizedSize,
        thumbnailSize: result.thumbnailSize,
        savingsPercent: result.savingsPercent,
        format: result.format.toUpperCase(),
      });

      onUpload(result.mainUrl);
      onUploadDetails?.(result);
    } catch (err) {
      console.warn("Image optimization/upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onUpload("");
    setStats(null);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-sm font-bold text-gray-700 dark:text-gray-300">{label}</label>

      {/* Main Image Preview / Dropzone */}
      <div
        className={`relative ${aspect} rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-600/60 overflow-hidden group transition-colors bg-gradient-to-br from-[#2e1065]/10 via-purple-950/10 to-[#5b21b6]/10 dark:from-[#2e1065]/40 dark:to-[#1e1136] ${className}`}
        style={aspect === "aspect-square" ? { aspectRatio: "1 / 1", maxWidth: "200px", maxHeight: "200px" } : undefined}
      >
        {uploading ? (
          <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-[#5b21b6]/90 to-[#2e1065] text-white gap-2 p-3 text-center">
            <span className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-extrabold">جاري الضغط الذكي (WebP) وتوليد المصغرة...</span>
          </div>
        ) : image ? (
          <>
            <img src={image} alt={label} className="w-full h-full object-cover transition-opacity duration-300" />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
              >
                📷 كاميرا
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
              >
                📁 معرض
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
              >
                🗑️ حذف
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2 p-3 text-center">
            <svg className="w-8 h-8 text-purple-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-xs font-bold text-gray-600 dark:text-gray-400">اختر طريقة رفع الصورة</span>
          </div>
        )}
      </div>

      {/* شارة إحصائيات الضغط الذكي والمصغرة */}
      {stats && image && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold bg-purple-50 dark:bg-[#241046] text-[#5b21b6] dark:text-purple-200 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-700/60 max-w-fit">
          <span>⚡ {stats.format}</span>
          <span>•</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
            تم ضغط {stats.savingsPercent}% ({formatByteSize(stats.originalSize)} ← {formatByteSize(stats.optimizedSize)})
          </span>
          <span>•</span>
          <span>مصغرة 200×200 ({formatByteSize(stats.thumbnailSize)})</span>
        </div>
      )}

      {/* Dual Upload Choice Buttons */}
      <div className="grid grid-cols-2 gap-2 max-w-[280px]">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
        >
          <span>📷</span>
          <span>التقاط بالكاميرا</span>
        </button>

        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
        >
          <span>📁</span>
          <span>اختر من الملفات</span>
        </button>
      </div>

      {/* Hidden File Inputs: Camera & Gallery */}
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
    </div>
  );
}
