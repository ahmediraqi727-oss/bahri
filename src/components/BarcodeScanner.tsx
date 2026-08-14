"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { lookupByBarcode } from "@/lib/barcode-service";
import { decodeBarcodeFromCanvas, decodeBarcodeFromFile } from "@/lib/barcode-decoder";
import type { Product } from "@/lib/types";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  canUseCamera?: boolean;
  canUseImageUpload?: boolean;
  canUseManualEntry?: boolean;
}

type ScanTab = "camera" | "image" | "manual";

export default function BarcodeScanner({
  isOpen,
  onClose,
  onScan,
  canUseCamera = true,
  canUseImageUpload = true,
  canUseManualEntry = true,
}: BarcodeScannerProps) {
  const availableTabs: ScanTab[] = [];
  if (canUseCamera) availableTabs.push("camera");
  if (canUseImageUpload) availableTabs.push("image");
  if (canUseManualEntry) availableTabs.push("manual");

  const [activeTab, setActiveTab] = useState<ScanTab>(availableTabs[0] || "manual");
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDecoding, setImageDecoding] = useState(false);
  const [imageError, setImageError] = useState("");
  const [lastScanned, setLastScanned] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastScanTimeRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      let stream: MediaStream;
      try {
        // Try back environment camera first for smartphones/tablets
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        // Fallback for laptops/desktops without environment camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        const video = videoRef.current;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.srcObject = stream;
        await video.play();
      }
      setIsScanning(true);
      scanLoop();
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("تعذّر الوصول إلى الكاميرا. تحقق من منح الإذن للمتصفح أو استخدم الإدخال اليدوي.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Throttled Computer Vision Scan Loop ───────────────────────────────────

  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    // Throttle decoding passes to max 10 FPS (every 100ms) for smooth video playback on mobile
    const now = performance.now();
    if (now - lastScanTimeRef.current < 100) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    lastScanTimeRef.current = now;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const tryDetect = async () => {
      try {
        const code = await decodeBarcodeFromCanvas(canvas);
        if (code) {
          handleScannedCode(code);
          return;
        }
      } catch { /* silent */ }

      rafRef.current = requestAnimationFrame(scanLoop);
    };

    tryDetect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Decode barcode from uploaded image ───────────────────────────────────

  const decodeImageFile = useCallback(async (file: File) => {
    setImageDecoding(true);
    setImageError("");
    try {
      const code = await decodeBarcodeFromFile(file);
      if (code) {
        handleScannedCode(code);
        setImageDecoding(false);
        return;
      }
      setImageError("لم يتم التعرف على باركود أو QR في الصورة. جرّب صورة أوضح أو الإدخال اليدوي.");
    } catch (err) {
      console.error("Image decode error:", err);
      setImageError("حدث خطأ أثناء معالجة الصورة.");
    }
    setImageDecoding(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScannedCode = useCallback((code: string) => {
    const cleaned = code.trim();
    if (!cleaned || cleaned === lastScanned) return;
    setLastScanned(cleaned);
    stopCamera();
    onScan(cleaned);
    onClose();
  }, [lastScanned, stopCamera, onScan, onClose]);

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) { stopCamera(); return; }
    if (activeTab === "camera" && canUseCamera) startCamera();
    return () => stopCamera();
  }, [isOpen, activeTab, canUseCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) {
      setManualCode(""); setImageFile(null); setImageError("");
      setLastScanned(""); setCameraError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const tabLabels: Record<ScanTab, { icon: string; label: string }> = {
    camera: { icon: "📷", label: "كاميرا مباشرة" },
    image: { icon: "🖼", label: "رفع صورة" },
    manual: { icon: "⌨", label: "إدخال يدوي" },
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-800 animate-fadeIn">

        {/* Header */}
        <div className="bg-gradient-to-l from-blue-600 to-indigo-700 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📷</span>
            <div>
              <h2 className="text-white font-extrabold text-base">ماسح الباركود والـ QR</h2>
              <p className="text-blue-200 text-xs">امسح أو ابحث بأي طريقة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        {availableTabs.length > 1 && (
          <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => { stopCamera(); setActiveTab(tab); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all ${
                  activeTab === tab
                    ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-900"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <span>{tabLabels[tab].icon}</span>
                <span>{tabLabels[tab].label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="p-5">

          {/* ── Camera Tab ── */}
          {activeTab === "camera" && (
            <div className="flex flex-col items-center gap-4">
              {cameraError ? (
                <div className="w-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-center">
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 underline"
                  >
                    إعادة المحاولة
                  </button>
                </div>
              ) : (
                <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-[4/3]">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                    autoPlay
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Scan viewfinder overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-56 h-40 border-2 border-blue-400 rounded-xl relative">
                      {/* Corner accents */}
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                      {/* Scan line animation */}
                      <div className="absolute inset-x-2 h-0.5 bg-blue-400/80 animate-[scan_2s_ease-in-out_infinite]" style={{ top: "50%", animation: "scan 2s ease-in-out infinite" }} />
                    </div>
                  </div>
                  {isScanning && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                      جاري المسح...
                    </div>
                  )}
                </div>
              )}

              {/* Flash Toggle */}
              {streamRef.current && (
                <button
                  onClick={async () => {
                    const track = streamRef.current?.getVideoTracks()[0];
                    if (!track) return;
                    try {
                      await (track as MediaStreamTrack & { applyConstraints: (c: object) => Promise<void> })
                        .applyConstraints({ advanced: [{ torch: !torchOn } as object] } as object);
                      setTorchOn(!torchOn);
                    } catch { /* torch not supported */ }
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    torchOn
                      ? "bg-yellow-400 text-yellow-900"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span>{torchOn ? "🔦" : "💡"}</span>
                  <span>{torchOn ? "إيقاف الفلاش" : "تشغيل الفلاش"}</span>
                </button>
              )}
            </div>
          )}

          {/* ── Image Upload Tab ── */}
          {activeTab === "image" && (
            <div className="flex flex-col items-center gap-4">
              <div
                className="w-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) { setImageFile(file); decodeImageFile(file); }
                }}
              >
                {imageFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={URL.createObjectURL(imageFile)}
                      alt="صورة الباركود"
                      className="max-h-32 rounded-xl object-contain"
                    />
                    <p className="text-xs text-gray-500">{imageFile.name}</p>
                  </div>
                ) : (
                  <>
                    <span className="text-4xl mb-2 block">🖼</span>
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">اسحب صورة هنا أو انقر للاختيار</p>
                    <p className="text-xs text-gray-400 mt-1">يدعم: JPG، PNG، WebP</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setImageFile(file); decodeImageFile(file); }
                }}
              />
              {imageDecoding && (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-medium animate-pulse">
                  <span>🔍</span><span>جاري فك شيفرة الباركود...</span>
                </div>
              )}
              {imageError && (
                <p className="text-red-600 dark:text-red-400 text-sm text-center">{imageError}</p>
              )}
            </div>
          )}

          {/* ── Manual Entry Tab ── */}
          {activeTab === "manual" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  أدخل رقم الباركود أو QR يدوياً
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualCode.trim().length >= 4) {
                        handleScannedCode(manualCode);
                      }
                    }}
                    placeholder="مثال: 6221234560001"
                    className="flex-1 px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                    inputMode="text"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-gray-400 text-center">
                  اكتب الرقم ثم اضغط Enter أو زر البحث
                </p>
              </div>
              <button
                onClick={() => manualCode.trim().length >= 1 && handleScannedCode(manualCode)}
                disabled={manualCode.trim().length < 1}
                className="w-full py-3 rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 text-white font-extrabold text-base hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                🔍 بحث عن المنتج
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes scan {
          0%, 100% { top: 10%; }
          50% { top: 85%; }
        }
      `}</style>
    </div>
  );
}
