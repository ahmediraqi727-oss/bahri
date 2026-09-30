"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { lookupByBarcode } from "@/lib/barcode-service";
import {
  decodeBarcodeFromCanvas,
  decodeBarcodeFromFile,
  decodeThermalOptimizedQR,
  enhanceThermalLabelImage,
} from "@/lib/barcode-decoder";
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

  // Front & Back Camera Switching States
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");

  // Thermal Label QR Optimization Mode (True by default for maximum barcode & sticker read speed)
  const [thermalMode, setThermalMode] = useState<boolean>(true);

  // Hardware Zoom Support
  const [supportsZoom, setSupportsZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number }>({ min: 1, max: 3, step: 0.1 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastScanTimeRef = useRef<number>(0);

  // Stop current camera tracks
  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
    setSupportsZoom(false);
  }, []);

  // Enumerate video devices
  const updateAvailableCameras = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setAvailableCameras(videoInputs);
      }
    } catch {
      // Ignore enumeration errors
    }
  }, []);

  // Start Camera with explicit facingMode and deviceId
  const startCamera = useCallback(async (targetFacing = facingMode, targetDeviceId = selectedCameraId) => {
    stopCamera();
    setCameraError("");

    try {
      let constraints: MediaStreamConstraints;

      if (targetDeviceId) {
        constraints = {
          video: {
            deviceId: { exact: targetDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
      } else {
        constraints = {
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        // Fallback for laptops/desktops without environment camera or specific ID
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      // Check zoom capabilities on the active video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const caps = (videoTrack.getCapabilities?.() || {}) as {
            zoom?: { min: number; max: number; step: number };
            torch?: boolean;
          };
          if (caps.zoom) {
            setSupportsZoom(true);
            setZoomRange({
              min: caps.zoom.min || 1,
              max: caps.zoom.max || 3,
              step: caps.zoom.step || 0.1,
            });
            const settings = videoTrack.getSettings?.() as { zoom?: number };
            if (settings?.zoom) setZoomLevel(settings.zoom);
          }
        } catch {
          // Capabilities check not supported
        }
      }

      if (videoRef.current) {
        const video = videoRef.current;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.srcObject = stream;
        await video.play();
      }

      setIsScanning(true);
      updateAvailableCameras();
      scanLoop();
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("تعذّر الوصول إلى الكاميرا. تحقق من منح الإذن للمتصفح أو استخدم الإدخال اليدوي.");
    }
  }, [facingMode, selectedCameraId, stopCamera, updateAvailableCameras]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle front/back camera
  const toggleCameraFacing = useCallback(() => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    setSelectedCameraId(""); // clear explicit device ID so facingMode applies
    startCamera(nextFacing, "");
  }, [facingMode, startCamera]);

  // Select specific camera from device list
  const handleSelectCamera = useCallback((deviceId: string) => {
    setSelectedCameraId(deviceId);
    startCamera(facingMode, deviceId);
  }, [facingMode, startCamera]);

  // Adjust camera hardware zoom
  const handleSetZoom = useCallback(async (newZoom: number) => {
    setZoomLevel(newZoom);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // @ts-expect-error — Camera Zoom Constraints API
      await track.applyConstraints({ advanced: [{ zoom: newZoom }] });
    } catch {
      // Zoom not supported
    }
  }, []);

  // ─── High-Speed Computer Vision Scan Loop with Thermal QR Optimization ───
  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    // High performance scan rate: 12-15 FPS (every 70ms) for instant detection
    const now = performance.now();
    if (now - lastScanTimeRef.current < 70) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    lastScanTimeRef.current = now;

    const tryDetect = async () => {
      // 1. Pass: Native BarcodeDetector API (fastest GPU acceleration)
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          // @ts-expect-error — BarcodeDetector API
          const detector = new window.BarcodeDetector({
            formats: ["qr_code", "data_matrix", "code_128", "ean_13", "ean_8", "code_39", "upc_a", "upc_e"],
          });
          const detected = await detector.detect(video);
          if (detected && detected.length > 0 && detected[0].rawValue) {
            handleScannedCode(detected[0].rawValue);
            return;
          }
        } catch { /* proceed */ }
      }

      // 2. Pass: Canvas Multi-Format & Thermal-Optimized QR Algorithm
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          let code: string | null = null;
          if (thermalMode) {
            // Enhanced Thermal Mode: ROI center-weighted cropping + glare removal + local contrast binarization
            code = await decodeThermalOptimizedQR(canvas);
          } else {
            code = await decodeBarcodeFromCanvas(canvas);
          }

          if (code) {
            handleScannedCode(code);
            return;
          }
        }
      } catch { /* proceed */ }

      rafRef.current = requestAnimationFrame(scanLoop);
    };

    tryDetect();
  }, [thermalMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <div className="barcode-scanner-container flex flex-col items-center gap-3 w-full">
              {/* Camera Switcher & Thermal Mode Bar */}
              <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800/60 p-2 rounded-2xl border border-gray-200 dark:border-gray-700/60 text-xs">
                {/* Front / Back Camera Switch Button */}
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold transition-all shadow-2xs"
                  title="التبديل بين الكاميرا الخلفية والأمامية"
                >
                  <span className="text-base">🔄</span>
                  <span>{facingMode === "environment" ? "كاميرا خلفية 📷" : "كاميرا أمامية 🤳"}</span>
                </button>

                {/* Thermal Label QR Optimization Toggle */}
                <button
                  type="button"
                  onClick={() => setThermalMode(!thermalMode)}
                  className={`flex-1 min-w-[150px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all shadow-2xs border ${
                    thermalMode
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25"
                      : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-200"
                  }`}
                  title="خوارزمية تباين فائقة لمسح ملصقات الطابعات الحرارية حتى في الإضاءة الخافتة أو مع الانعكاس"
                >
                  <span className="text-base">⚡</span>
                  <span>ملصقات حرارية: {thermalMode ? "مُفعّل 🔥" : "إيقاف"}</span>
                </button>
              </div>

              {/* Multi-Camera Device Selector (when more than 1 camera exists) */}
              {availableCameras.length > 1 && (
                <div className="w-full flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 shrink-0">اختيار الكاميرا:</span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleSelectCamera(e.target.value)}
                    className="flex-1 px-2.5 py-1 rounded-xl text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">تلقائي ({facingMode === "environment" ? "خلفية" : "أمامية"})</option>
                    {availableCameras.map((cam, idx) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `كاميرا ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cameraError ? (
                <div className="w-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-center">
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">{cameraError}</p>
                  <button
                    onClick={() => startCamera()}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 underline font-bold"
                  >
                    إعادة المحاولة
                  </button>
                </div>
              ) : (
                <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-[4/3] shadow-lg border border-gray-800">
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
                    <div className={`w-64 h-48 border-2 rounded-2xl relative transition-all ${
                      thermalMode ? "border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)]" : "border-blue-400"
                    }`}>
                      {/* Corner accents */}
                      <div className={`absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 rounded-tl-xl ${
                        thermalMode ? "border-amber-400" : "border-blue-400"
                      }`} />
                      <div className={`absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 rounded-tr-xl ${
                        thermalMode ? "border-amber-400" : "border-blue-400"
                      }`} />
                      <div className={`absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 rounded-bl-xl ${
                        thermalMode ? "border-amber-400" : "border-blue-400"
                      }`} />
                      <div className={`absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 rounded-br-xl ${
                        thermalMode ? "border-amber-400" : "border-blue-400"
                      }`} />

                      {/* Center Crosshairs for Small Thermal Codes */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 pointer-events-none opacity-40">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-white" />
                        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-6 h-0.5 bg-white" />
                      </div>

                      {/* Scan line animation */}
                      <div
                        className={`absolute inset-x-2 h-0.5 animate-[scan_1.6s_ease-in-out_infinite] ${
                          thermalMode ? "bg-amber-400 shadow-[0_0_8px_#fbbf24]" : "bg-blue-400/90 shadow-[0_0_8px_#60a5fa]"
                        }`}
                        style={{ top: "50%", animation: "scan 1.6s ease-in-out infinite" }}
                      />
                    </div>
                  </div>

                  {/* Status Indicator Pill */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-white font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{thermalMode ? "Thermal OCR ⚡" : "Standard QR"}</span>
                  </div>

                  {isScanning && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3.5 py-1 rounded-full backdrop-blur-sm border border-white/10 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                      <span>ضع الملصق أو الباركود داخل الإطار</span>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Quick Tools (Torch & Zoom) */}
              <div className="w-full flex items-center justify-between gap-2 pt-1">
                {/* Flashlight Toggle */}
                {streamRef.current && (
                  <button
                    type="button"
                    onClick={async () => {
                      const track = streamRef.current?.getVideoTracks()[0];
                      if (!track) return;
                      try {
                        await (track as MediaStreamTrack & { applyConstraints: (c: object) => Promise<void> })
                          .applyConstraints({ advanced: [{ torch: !torchOn } as object] } as object);
                        setTorchOn(!torchOn);
                      } catch { /* torch not supported */ }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      torchOn
                        ? "bg-yellow-400/20 border-yellow-400/50 text-yellow-800 dark:text-yellow-300"
                        : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <span>{torchOn ? "🔦" : "💡"}</span>
                    <span>{torchOn ? "إيقاف الفلاش" : "تشغيل الفلاش"}</span>
                  </button>
                )}

                {/* Digital Zoom Stepper for Small Thermal Stickers */}
                {supportsZoom && (
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 text-xs">
                    <span className="text-[10px] text-gray-500 font-bold px-1">تقريب:</span>
                    {[1, 1.5, 2].map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => handleSetZoom(z)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-bold font-mono transition-all ${
                          Math.abs(zoomLevel - z) < 0.1
                            ? "bg-blue-600 text-white shadow-2xs"
                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      >
                        {z}×
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
