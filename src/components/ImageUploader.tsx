"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";

interface ImageUploaderProps {
  label: string;
  image: string;
  onUpload: (imageUrl: string) => void;
  aspect?: string;
  bucket?: string;
  className?: string;
}

export default function ImageUploader({
  label,
  image,
  onUpload,
  aspect = "aspect-video",
  bucket = "site-assets",
  className = "",
}: ImageUploaderProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Compress image using HTML Canvas fallback
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          const maxDim = 800; // Limit max dimension to 800px

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL("image/jpeg", 0.7); // 70% quality JPEG
            resolve(compressed);
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Try uploading file directly to Supabase Storage bucket
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true, cacheControl: "3600" });

      if (!uploadError && uploadData) {
        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        if (publicUrlData?.publicUrl) {
          onUpload(publicUrlData.publicUrl);
          setUploading(false);
          return;
        }
      }

      // 2. Fallback: If storage upload fails, compress image locally to tiny JPEG string (< 50KB)
      const compressedUrl = await compressImage(file);
      onUpload(compressedUrl);
    } catch (err) {
      console.warn("Storage upload fallback error:", err);
      const fallbackUrl = await compressImage(file);
      onUpload(fallbackUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onUpload("");
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-sm font-bold text-gray-700 dark:text-gray-300">{label}</label>

      {/* Main Image Preview / Dropzone */}
      <div
        className={`relative ${aspect} rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden group transition-colors bg-gray-50 dark:bg-gray-800/50 ${className}`}
        style={aspect === "aspect-square" ? { aspectRatio: "1 / 1", maxWidth: "200px", maxHeight: "200px" } : undefined}
      >
        {uploading ? (
          <div className="flex flex-col items-center justify-center h-full text-blue-600 dark:text-blue-400 gap-2">
            <span className="animate-spin text-2xl">🔄</span>
            <span className="text-xs font-bold">جاري رفع الصورة...</span>
          </div>
        ) : image ? (
          <>
            <img src={image} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
              >
                📷 كاميرا
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
              >
                📁 معرض
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
              >
                🗑️ حذف
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2 p-3 text-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Dual Upload Choice Buttons */}
      <div className="grid grid-cols-2 gap-2 max-w-[280px]">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          <span>📷</span>
          <span>التقاط بالكاميرا</span>
        </button>

        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
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
