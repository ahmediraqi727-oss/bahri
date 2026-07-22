"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

interface GalleryImage {
  id: string;
  position: number;
  image_url: string;
}

const TOTAL_SLOTS = 10;

export default function HeroGalleryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number>(0);
  const [rawImage, setRawImage] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragPanStart, setDragPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  useEffect(() => {
    if (user && user.role !== "manager" && user.role !== "admin") {
      router.push("/");
    }
  }, [user, router]);

  const fetchImages = useCallback(async () => {
    const { data } = await supabase
      .from("hero_gallery")
      .select("id, position, image_url")
      .order("position", { ascending: true });
    if (data) setImages(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const getImageForSlot = (slot: number): string | null => {
    const img = images.find((i) => i.position === slot);
    return img?.image_url || null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawImage(ev.target?.result as string);
      setZoom(1);
      setPanX(0);
      setPanY(0);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const drawCropPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const img = new Image();
    if (!canvas || !rawImage) return;
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const size = 400;
      canvas.width = size;
      canvas.height = size;

      ctx.clearRect(0, 0, size, size);

      const baseW = img.width;
      const baseH = img.height;
      const minDim = Math.min(baseW, baseH);
      const srcSize = minDim / zoom;
      const srcX = (baseW - srcSize) / 2 - panX / zoom;
      const srcY = (baseH - srcSize) / 2 - panY / zoom;

      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);
    };
    img.src = rawImage;
  }, [rawImage, zoom, panX, panY]);

  useEffect(() => {
    if (rawImage) drawCropPreview();
  }, [rawImage, zoom, panX, panY, drawCropPreview]);

  const openModal = (slot: number) => {
    setEditingSlot(slot);
    const existing = getImageForSlot(slot);
    if (existing) {
      setRawImage(existing);
      setZoom(1);
      setPanX(0);
      setPanY(0);
    } else {
      setRawImage("");
      setZoom(1);
      setPanX(0);
      setPanY(0);
    }
    setModalOpen(true);
  };

  const handleSaveImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.6);

    const existing = images.find((i) => i.position === editingSlot);
    if (existing) {
      const { error } = await supabase
        .from("hero_gallery")
        .update({ image_url: croppedDataUrl, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (!error) {
        setImages((prev) =>
          prev.map((i) => (i.position === editingSlot ? { ...i, image_url: croppedDataUrl } : i))
        );
      }
    } else {
      const { data, error } = await supabase
        .from("hero_gallery")
        .insert({ position: editingSlot, image_url: croppedDataUrl })
        .select("id, position, image_url")
        .single();
      if (!error && data) {
        setImages((prev) => [...prev, data].sort((a, b) => a.position - b.position));
      }
    }
    setModalOpen(false);
    setRawImage("");
    setUnsavedChanges(true);
    setTimeout(() => setUnsavedChanges(false), 3000);
  };

  const handleDeleteImage = async (slot: number) => {
    const existing = images.find((i) => i.position === slot);
    if (!existing) return;
    await supabase.from("hero_gallery").delete().eq("id", existing.id);
    setImages((prev) => prev.filter((i) => i.position !== slot));
    setModalOpen(false);
    setRawImage("");
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!rawImage) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragPanStart({ x: panX, y: panY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setPanX(dragPanStart.x + dx);
    setPanY(dragPanStart.y + dy);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!rawImage || e.touches.length !== 1) return;
    setIsDragging(true);
    setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    setDragPanStart({ x: panX, y: panY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStart.x;
    const dy = e.touches[0].clientY - dragStart.y;
    setPanX(dragPanStart.x + dx);
    setPanY(dragPanStart.y + dy);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🖼️ صور الواجهة الرئيسية</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            ارفع الصور التي تظهر تحت البانر الترحيبي في الصفحة الرئيسية
          </p>
        </div>
        {unsavedChanges && (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium animate-pulse">
            ✓ تم الحفظ
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {Array.from({ length: TOTAL_SLOTS }, (_, i) => i).map((slot) => {
          const img = getImageForSlot(slot);
          return (
            <button
              key={slot}
              onClick={() => openModal(slot)}
              className="relative aspect-square rounded-2xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-all group bg-gray-50 dark:bg-gray-800"
            >
              {img ? (
                <>
                  <img src={img} alt={`صورة ${slot + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                    <span className="text-white text-3xl opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors">
                  <span className="text-4xl mb-1">+</span>
                  <span className="text-xs">{slot + 1}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  تعديل الصورة — المربع {editingSlot + 1}
                </h3>
                <button onClick={() => { setModalOpen(false); setRawImage(""); }} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
              </div>

              {!rawImage ? (
                <div className="space-y-4">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl flex flex-col items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-500 transition-all"
                  >
                    <span className="text-5xl mb-2">📁</span>
                    <span className="text-sm font-medium">اختر صورة من الجهاز</span>
                  </button>
                  {getImageForSlot(editingSlot) && (
                    <button
                      onClick={() => handleDeleteImage(editingSlot)}
                      className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      🗑️ حذف الصورة
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-900 cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleMouseUp}
                  >
                    <canvas ref={canvasRef} className="w-full h-full" />
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm">
                      اسحب للتحريك
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">التكبير</label>
                      <span className="text-xs text-gray-500">{Math.round(zoom * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.1"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setRawImage(""); setZoom(1); setPanX(0); setPanY(0); }}
                      className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      تغيير الصورة
                    </button>
                    <button
                      onClick={handleSaveImage}
                      className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                    >
                      💾 حفظ
                    </button>
                  </div>

                  {getImageForSlot(editingSlot) && (
                    <button
                      onClick={() => handleDeleteImage(editingSlot)}
                      className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      🗑️ حذف الصورة
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
