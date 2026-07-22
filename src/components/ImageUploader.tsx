"use client";

import { useRef } from "react";

interface ImageUploaderProps {
  label: string;
  image: string;
  onUpload: (dataUrl: string) => void;
  aspect?: string;
}

export default function ImageUploader({ label, image, onUpload, aspect = "aspect-video" }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      onUpload(result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    onUpload("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div
        className={`relative ${aspect} rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden group cursor-pointer hover:border-[var(--primary)] transition-colors`}
        onClick={() => inputRef.current?.click()}
      >
        {image ? (
          <>
            <img
              src={image}
              alt={label}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <span className="text-white text-sm font-medium">تغيير الصورة</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-600"
              >
                حذف
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm">اضغط لرفع صورة</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
