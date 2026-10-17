"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { lookupByBarcode } from "@/lib/barcode-service";
import {
  decodeBarcodeFromCanvas,
  decodeBarcodeFromFile,
  decodeThermalOptimizedQR,
  enhanceThermalLabelImage,
} from "@/lib/barcode-decoder";
import {
  triggerSuccessSensoryFeedback,
  triggerToggleFeedback,
} from "@/lib/sensory-feedback";
import {
  loadSavedCameraSettings,
  saveCameraSettings,
  CAMERA_RESOLUTIONS,
  type CameraSettingsState,
} from "@/lib/camera-config";
import CameraSettingsModal from "@/components/CameraSettingsModal";
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

  // Sensory Feedback Mode (Sound chime + Haptic vibration on success)
  const [sensoryFeedbackEnabled, setSensoryFeedbackEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ahmed_bahri_scanner_sensory");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  const toggleSensoryFeedback = useCallback(() => {
    setSensoryFeedbackEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("ahmed_bahri_scanner_sensory", String(next));
      }
      if (next) triggerToggleFeedback();
      return next;
    });
  }, []);

  // Camera Resolution & Frame Rate Settings (Low-End Device Optimization)
  const [cameraSettings, setCameraSettings] = useState<CameraSettingsState>(loadSavedCameraSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Mobile-Optimized Collapsible Options Drawer State
  const [optionsDrawerOpen, setOptionsDrawerOpen] = useState(false);

  // Categorized Camera Error Type for Mobile-Specific Guidance
  type CameraErrorType = "none" | "permission_denied" | "insecure_context" | "not_supported" | "in_use" | "not_found" | "generic";
  const [cameraErrorType, setCameraErrorType] = useState<CameraErrorType>("none");

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

  // Stop current camera tracks cleanly with video release
  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch { /* silent */ }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
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

  // ─── Scanned Code Handler ──────────────────────────────────────────────────
  const handleScannedCode = useCallback((code: string) => {
    const cleaned = code.trim();
    if (!cleaned || cleaned === lastScanned) return;
    setLastScanned(cleaned);

    // Trigger dedicated sensory feedback (crystal chime + haptic vibration)
    triggerSuccessSensoryFeedback(sensoryFeedbackEnabled);

    stopCamera();
    onScan(cleaned);
    onClose();
  }, [lastScanned, sensoryFeedbackEnabled, stopCamera, onScan, onClose]);

  // ─── High-Speed Computer Vision Scan Loop with Thermal QR Optimization ───
  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    // Adaptive scan rate tuned to camera frame rate:
    // 15 FPS -> throttled to ~70ms to drastically reduce CPU load on weak phones
    // 30 FPS -> throttled to ~40ms
    // 60 FPS -> throttled to ~20ms
    const targetThrottle = Math.max(25, Math.round(1000 / (cameraSettings.fps || 30)));
    const now = performance.now();
    if (now - lastScanTimeRef.current < targetThrottle) {
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
  }, [cameraSettings.fps, handleScannedCode, thermalMode]);

  // Start Camera with explicit facingMode, deviceId, progressive mobile fallback, and permissions check
  const startCamera = useCallback(
    async (
      targetFacing = facingMode,
      targetDeviceId = selectedCameraId,
      targetSettings = cameraSettings
    ) => {
      stopCamera();
      setCameraError("");
      setCameraErrorType("none");

      // 1. Secure context verification (Mobile Chrome/Safari block camera on plain HTTP)
      if (typeof window !== "undefined" && window.isSecureContext === false) {
        setCameraErrorType("insecure_context");
        setCameraError("يتطلب تشغيل الكاميرا اتصالاً مشفراً وآمناً (HTTPS). يرجى فتح الموقع عبر HTTPS.");
        return;
      }

      // 2. MediaDevices API existence check
      if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraErrorType("not_supported");
        setCameraError("متصفحك الحالي لا يدعم واجهة الوصول المباشر للكاميرا (MediaDevices API). يرجى استخدام متصفح حديث مثل Chrome أو Safari.");
        return;
      }

      // Small pause to allow mobile camera hardware drivers to cleanly release previous locks
      await new Promise((resolve) => setTimeout(resolve, 60));

      try {
        const resConfig = CAMERA_RESOLUTIONS[targetSettings.resolution] || CAMERA_RESOLUTIONS["720p"];
        const targetFps = targetSettings.fps || 30;

        let stream: MediaStream | null = null;

        // Stage 1: Attempt with target device/facing and requested resolution
        try {
          let stage1Constraints: MediaStreamConstraints;
          if (targetDeviceId) {
            stage1Constraints = {
              video: {
                deviceId: { exact: targetDeviceId },
                width: { ideal: resConfig.width },
                height: { ideal: resConfig.height },
                frameRate: { ideal: targetFps, max: targetFps },
              },
              audio: false,
            };
          } else {
            stage1Constraints = {
              video: {
                facingMode: { ideal: targetFacing },
                width: { ideal: resConfig.width },
                height: { ideal: resConfig.height },
                frameRate: { ideal: targetFps, max: targetFps },
              },
              audio: false,
            };
          }
          stream = await navigator.mediaDevices.getUserMedia(stage1Constraints);
        } catch (stage1Err) {
          console.warn("Stage 1 constraints failed on mobile, attempting relaxed Stage 2:", stage1Err);

          // Stage 2: Relax constraints to basic facingMode without resolution restrictions (mobile auto-negotiates best native res)
          try {
            const stage2Constraints: MediaStreamConstraints = {
              video: {
                facingMode: targetFacing === "user" ? "user" : "environment",
              },
              audio: false,
            };
            stream = await navigator.mediaDevices.getUserMedia(stage2Constraints);
          } catch (stage2Err) {
            console.warn("Stage 2 relaxed failed, attempting Stage 3 bare video:", stage2Err);

            // Stage 3: Bare video constraint
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        if (!stream) {
          throw new Error("تعذّر بدء بث الفيديو من الكاميرا.");
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

        // Attach to video element and synchronize metadata ready event
        if (videoRef.current) {
          const video = videoRef.current;
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          video.muted = true;
          video.srcObject = stream;

          // Wait for metadata loaded event before calling play to avoid unhandled play rejections on mobile
          await new Promise<void>((resolve) => {
            if (video.readyState >= 1) {
              resolve();
            } else {
              const onLoaded = () => {
                video.removeEventListener("loadedmetadata", onLoaded);
                resolve();
              };
              video.addEventListener("loadedmetadata", onLoaded);
              setTimeout(() => {
                video.removeEventListener("loadedmetadata", onLoaded);
                resolve();
              }, 600);
            }
          });

          try {
            await video.play();
          } catch (playErr) {
            console.warn("video.play() was prevented by browser:", playErr);
          }
        }

        setIsScanning(true);
        updateAvailableCameras();
        scanLoop();
      } catch (err: unknown) {
        console.error("Camera access error:", err);
        const errorObj = err as { name?: string; message?: string };
        const errName = errorObj?.name || "";

        if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
          setCameraErrorType("permission_denied");
          setCameraError("تم رفض إذن الوصول للكاميرا من قبل المتصفح. اتبع الخطوات أدناه لمنح الإذن.");
        } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
          setCameraErrorType("not_found");
          setCameraError("لم يتم العثور على كاميرا متصلة بجهازك.");
        } else if (errName === "NotReadableError" || errName === "TrackStartError") {
          setCameraErrorType("in_use");
          setCameraError("الكاميرا قيد الاستخدام حالياً بواسطة تطبيق آخر أو علامة تبويب أخرى.");
        } else if (errName === "OverconstrainedError") {
          setCameraErrorType("generic");
          setCameraError("إعدادات الدقة المطلوبة غير مدعومة من عدسة الكاميرا الحالية.");
        } else if (errName === "SecurityError") {
          setCameraErrorType("insecure_context");
          setCameraError("يتطلب تشغيل الكاميرا اتصالاً مشفراً (HTTPS).");
        } else {
          setCameraErrorType("generic");
          setCameraError(errorObj?.message || "تعذّر الوصول إلى الكاميرا. تحقق من منح الإذن للمتصفح أو استخدم الإدخال اليدوي.");
        }
      }
    },
    [facingMode, selectedCameraId, cameraSettings, stopCamera, updateAvailableCameras, scanLoop]
  );

  // Toggle front/back camera
  const toggleCameraFacing = useCallback(() => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    setSelectedCameraId(""); // clear explicit device ID so facingMode applies
    startCamera(nextFacing, "", cameraSettings);
  }, [facingMode, cameraSettings, startCamera]);

  // Select specific camera from device list
  const handleSelectCamera = useCallback((deviceId: string) => {
    setSelectedCameraId(deviceId);
    startCamera(facingMode, deviceId, cameraSettings);
  }, [facingMode, cameraSettings, startCamera]);

  // Save and apply camera resolution and frame rate settings
  const handleSaveCameraSettings = useCallback(
    (newSettings: CameraSettingsState) => {
      setCameraSettings(newSettings);
      saveCameraSettings(newSettings);
      startCamera(facingMode, selectedCameraId, newSettings);
    },
    [facingMode, selectedCameraId, startCamera]
  );

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
  }, [handleScannedCode]);

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto" dir="rtl">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#150b2a] text-white rounded-3xl shadow-2xl shadow-purple-950/70 w-full max-w-md overflow-hidden border border-purple-500/30 animate-fadeIn my-auto">

        {/* Header */}
        <div className="bg-gradient-to-l from-[#5b21b6] via-[#6d28d9] to-[#4c1d95] px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between border-b border-purple-400/20">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-xl shrink-0 shadow-inner">
              📷
            </span>
            <div className="min-w-0">
              <h2 className="text-white font-extrabold text-sm sm:text-base leading-tight truncate">
                ماسح الباركود والـ QR
              </h2>
              <p className="text-purple-200 text-[11px] truncate mt-0.5">
                امسح بالكاميرا أو ابحث بأي طريقة بسرعة ودقة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold transition-all shrink-0 active:scale-95 border border-white/15"
            title="إغلاق"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector Tabs */}
        {availableTabs.length > 1 && (
          <div className="grid grid-cols-3 border-b border-purple-500/25 bg-[#1a0e33] p-1.5 gap-1.5">
            {availableTabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setActiveTab(tab);
                  }}
                  className={`min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-[#5b21b6] text-white shadow-md shadow-purple-900/50 border border-purple-400/40"
                      : "text-purple-200/75 hover:text-white hover:bg-purple-900/35 border border-transparent"
                  }`}
                >
                  <span className="shrink-0 text-sm">{tabLabels[tab].icon}</span>
                  <span className="whitespace-nowrap">{tabLabels[tab].label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="p-3.5 sm:p-5">

          {/* ── Camera Tab ── */}
          {activeTab === "camera" && (
            <div className="barcode-scanner-container flex flex-col items-center gap-3 w-full">
              {/* ── Single Unified Camera Control Toolbar (Outside Video) ── */}
              <div className="w-full flex flex-col gap-2.5">
                <div className="w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-2 bg-[#1e1136] rounded-2xl border border-purple-500/30 shadow-inner">
                  {/* Action 1: Flip Camera Button */}
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    className={`flex-1 min-w-[100px] min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-extrabold text-xs whitespace-nowrap shrink-0 transition-all shadow-sm active:scale-95 border ${
                      facingMode === "environment"
                        ? "bg-[#5b21b6] hover:bg-[#6d28d9] text-white border-purple-400/50 shadow-purple-900/30"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/50 shadow-indigo-900/30"
                    }`}
                    title="تبديل الكاميرا بين الخلفية والأمامية"
                  >
                    <span className="text-sm shrink-0">🔄</span>
                    <span className="whitespace-nowrap">
                      {facingMode === "environment" ? "خلفية 📷" : "أمامية 🤳"}
                    </span>
                  </button>

                  {/* Action 2: Sensory Audio / Vibration Toggle Button */}
                  <button
                    type="button"
                    onClick={toggleSensoryFeedback}
                    className={`flex-1 min-w-[110px] min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-extrabold text-xs whitespace-nowrap shrink-0 transition-all shadow-sm active:scale-95 border ${
                      sensoryFeedbackEnabled
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50 shadow-emerald-900/30"
                        : "bg-[#2a174a] hover:bg-[#351e5c] text-purple-200 border-purple-500/30"
                    }`}
                    title={sensoryFeedbackEnabled ? "الملاحظات الحسية مفعّلة - انقر للكتم" : "الملاحظات الحسية معطلة - انقر للتفعيل"}
                  >
                    <span className="text-sm shrink-0">{sensoryFeedbackEnabled ? "🔊" : "🔇"}</span>
                    <span className="whitespace-nowrap">
                      {sensoryFeedbackEnabled ? "صوت واهتزاز" : "صامت"}
                    </span>
                  </button>

                  {/* Action 3: Expandable Options Drawer Trigger */}
                  <button
                    type="button"
                    onClick={() => setOptionsDrawerOpen(!optionsDrawerOpen)}
                    className={`flex-1 sm:flex-initial min-w-[95px] min-h-[44px] flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-extrabold text-xs whitespace-nowrap shrink-0 transition-all shadow-sm active:scale-95 border ${
                      optionsDrawerOpen
                        ? "bg-amber-600 hover:bg-amber-500 text-white border-amber-400/60 shadow-amber-900/30"
                        : "bg-[#2a174a] hover:bg-[#351e5c] text-purple-100 border-purple-500/30"
                    }`}
                    title="خيارات إضافية: جودة الكاميرا، الملصقات الحرارية، واختيار العدسة"
                  >
                    <span className="text-sm shrink-0">⚙️</span>
                    <span className="whitespace-nowrap">خيارات</span>
                    <span className="text-[10px] opacity-80">{optionsDrawerOpen ? "▲" : "▼"}</span>
                  </button>
                </div>

                {/* Collapsible Secondary Options Panel */}
                {optionsDrawerOpen && (
                  <div className="w-full bg-[#1e1136] p-3.5 rounded-2xl border border-purple-500/35 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-purple-500/20 font-extrabold text-purple-100">
                      <span className="flex items-center gap-1.5">
                        <span>🛠️</span>
                        <span>إعدادات وخيارات الكاميرا المتقدمة</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setOptionsDrawerOpen(false)}
                        className="text-purple-300 hover:text-white text-xs font-bold px-2 py-0.5 rounded-lg hover:bg-purple-800/40 transition-colors whitespace-nowrap"
                      >
                        إغلاق ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      {/* Thermal Label Mode Toggle */}
                      <button
                        type="button"
                        onClick={() => setThermalMode(!thermalMode)}
                        className={`min-h-[44px] flex items-center justify-between p-2.5 rounded-xl border font-bold transition-all whitespace-nowrap ${
                          thermalMode
                            ? "bg-amber-500/20 border-amber-400/60 text-amber-200"
                            : "bg-[#150b2a] border-purple-500/30 text-purple-200 hover:bg-[#251444]"
                        }`}
                        title="خوارزمية تباين فائقة لمسح ملصقات الطابعات الحرارية"
                      >
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <span>⚡</span>
                          <span>ملصقات حرارية</span>
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-lg font-extrabold whitespace-nowrap ${
                            thermalMode
                              ? "bg-amber-500/30 text-amber-200 border border-amber-400/40"
                              : "bg-purple-900/50 text-purple-300"
                          }`}
                        >
                          {thermalMode ? "مفعّل 🔥" : "إيقاف"}
                        </span>
                      </button>

                      {/* Resolution & FPS Settings Modal Trigger */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsSettingsOpen(true);
                          setOptionsDrawerOpen(false);
                        }}
                        className="min-h-[44px] flex items-center justify-between p-2.5 rounded-xl border border-purple-500/30 bg-[#150b2a] text-purple-100 font-bold hover:bg-[#251444] transition-all whitespace-nowrap"
                        title="تغيير دقة الكاميرا ومعدل الإطارات"
                      >
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <span>🎞️</span>
                          <span>دقة وسرعة الكاميرا</span>
                        </span>
                        <span className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-lg bg-[#5b21b6]/50 text-purple-200 border border-purple-400/30 font-bold whitespace-nowrap">
                          {cameraSettings.resolution} • {cameraSettings.fps}fps
                        </span>
                      </button>
                    </div>

                    {/* Multi-Camera Device Selector (when more than 1 camera exists) */}
                    {availableCameras.length > 1 && (
                      <div className="flex items-center gap-2 pt-2 border-t border-purple-500/20">
                        <span className="text-xs font-bold text-purple-200 shrink-0 whitespace-nowrap">العدسة النشطة:</span>
                        <select
                          value={selectedCameraId}
                          onChange={(e) => handleSelectCamera(e.target.value)}
                          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs bg-[#150b2a] border border-purple-500/40 text-purple-100 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">تلقائي ({facingMode === "environment" ? "خلفية" : "أمامية"})</option>
                          {availableCameras.map((cam, idx) => (
                            <option key={cam.deviceId} value={cam.deviceId}>
                              {cam.label || `عدسة ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Camera Error & Interactive Permissions Guidance Card ── */}
              {cameraError ? (
                <div className="w-full animate-in fade-in duration-200">
                  {cameraErrorType === "permission_denied" ? (
                    <div className="w-full bg-[#1e1136] border border-purple-500/40 rounded-2xl p-4 sm:p-5 text-right space-y-3.5 shadow-xl text-xs">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-purple-500/25">
                        <div className="flex items-center gap-2 text-amber-300 font-extrabold text-sm min-w-0">
                          <span className="text-lg shrink-0">🔒</span>
                          <span className="truncate">إذن الكاميرا محظور في المتصفح</span>
                        </div>
                        <span className="text-[10px] px-2.5 py-0.5 rounded-lg bg-red-950/90 border border-red-500/40 text-red-300 font-bold whitespace-nowrap shrink-0">
                          تم الرفض
                        </span>
                      </div>

                      <p className="text-purple-200 leading-relaxed text-xs">
                        قام متصفح جهازك بحظر تشغيل الكاميرا. يمكنك تفعيلها بخطوات سريعة لمواصلة المسح:
                      </p>

                      <div className="bg-[#150b2a] rounded-2xl p-3.5 border border-purple-500/25 space-y-2.5 text-purple-100 text-[11px] leading-relaxed">
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-[#5b21b6] text-white font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                          <span>اضغط على أيقونة <strong>القفل 🔒</strong> أو <strong>الإعدادات ⚙️</strong> بجانب رابط الموقع في شريط العناوين بالأعلى.</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-[#5b21b6] text-white font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                          <span>اختر <strong>أذونات الموقع (Permissions)</strong> ثم غيّر <strong>الكاميرا (Camera)</strong> إلى <strong>سماح (Allow)</strong>.</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-[#5b21b6] text-white font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                          <span>اضغط على زر <strong>إعادة طلب الإذن</strong> أدناه للبدء في المسح فوراً.</span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => startCamera()}
                          className="w-full min-h-[44px] py-2.5 px-4 bg-gradient-to-l from-[#5b21b6] to-[#7c3aed] hover:from-[#6d28d9] hover:to-[#8b5cf6] text-white font-extrabold rounded-xl shadow-lg shadow-purple-900/40 active:scale-95 transition-all text-xs flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          <span>🔄</span>
                          <span>إعادة طلب الإذن ومحاولة الفتح</span>
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => { stopCamera(); setActiveTab("image"); }}
                            className="min-h-[44px] py-2 px-3 bg-[#2a174a] hover:bg-[#351e5c] text-purple-100 font-bold rounded-xl border border-purple-500/35 active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <span>🖼️</span>
                            <span>مسح من صورة</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { stopCamera(); setActiveTab("manual"); }}
                            className="min-h-[44px] py-2 px-3 bg-[#2a174a] hover:bg-[#351e5c] text-purple-100 font-bold rounded-xl border border-purple-500/35 active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <span>⌨️</span>
                            <span>إدخال يدوي</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : cameraErrorType === "insecure_context" ? (
                    <div className="w-full bg-[#1e1136] border border-amber-500/40 rounded-2xl p-4 text-center space-y-2.5 text-xs">
                      <span className="text-3xl block">⚠️</span>
                      <h4 className="font-extrabold text-amber-300 text-sm">اتصال غير مشفر (HTTPS مطلوب)</h4>
                      <p className="text-purple-200 leading-relaxed text-[11px]">
                        تمنع متصفحات الهواتف فتح الكاميرا عبر روابط HTTP غير المشفرة لحماية خصوصيتك. يرجى فتح الموقع عبر HTTPS أو استخدام الإدخال اليدوي.
                      </p>
                      <button
                        type="button"
                        onClick={() => { stopCamera(); setActiveTab("manual"); }}
                        className="mt-2 min-h-[44px] px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs active:scale-95 transition-all whitespace-nowrap"
                      >
                        ⌨️ الانتقال للإدخال اليدوي
                      </button>
                    </div>
                  ) : (
                    <div className="w-full bg-[#1e1136] border border-red-500/40 rounded-2xl p-4 text-center space-y-3">
                      <p className="text-red-300 text-xs sm:text-sm font-bold leading-relaxed">{cameraError}</p>
                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => startCamera()}
                          className="min-h-[44px] px-4 py-2 bg-[#5b21b6] hover:bg-[#6d28d9] text-white font-bold rounded-xl text-xs transition-all active:scale-95 whitespace-nowrap"
                        >
                          إعادة المحاولة 🔄
                        </button>
                        <button
                          type="button"
                          onClick={() => { stopCamera(); setActiveTab("manual"); }}
                          className="min-h-[44px] px-4 py-2 bg-[#2a174a] hover:bg-[#351e5c] text-purple-100 font-bold rounded-xl text-xs border border-purple-500/30 whitespace-nowrap"
                        >
                          إدخال يدوي ⌨️
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Clean Video Viewport (Free of Duplicate Floating Buttons) ── */
                <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-[4/3] shadow-xl border border-purple-500/35">
                  <video
                    ref={videoRef}
                    className={`w-full h-full object-cover transition-transform ${facingMode === "user" ? "-scale-x-100" : ""}`}
                    playsInline
                    muted
                    autoPlay
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Scan viewfinder overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className={`w-60 sm:w-64 h-44 sm:h-48 border-2 rounded-2xl relative transition-all ${
                        thermalMode
                          ? "border-amber-400/90 shadow-[0_0_20px_rgba(251,191,36,0.25)]"
                          : "border-purple-400/90 shadow-[0_0_20px_rgba(168,85,247,0.25)]"
                      }`}
                    >
                      {/* Corner accents */}
                      <div
                        className={`absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 rounded-tl-xl ${
                          thermalMode ? "border-amber-400" : "border-purple-400"
                        }`}
                      />
                      <div
                        className={`absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 rounded-tr-xl ${
                          thermalMode ? "border-amber-400" : "border-purple-400"
                        }`}
                      />
                      <div
                        className={`absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 rounded-bl-xl ${
                          thermalMode ? "border-amber-400" : "border-purple-400"
                        }`}
                      />
                      <div
                        className={`absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 rounded-br-xl ${
                          thermalMode ? "border-amber-400" : "border-purple-400"
                        }`}
                      />

                      {/* Center Crosshairs for Small Thermal Codes */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 pointer-events-none opacity-40">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-white" />
                        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-6 h-0.5 bg-white" />
                      </div>

                      {/* Scan line animation */}
                      <div
                        className={`absolute inset-x-2 h-0.5 ${
                          thermalMode
                            ? "bg-amber-400 shadow-[0_0_8px_#fbbf24]"
                            : "bg-purple-400 shadow-[0_0_8px_#c084fc]"
                        }`}
                        style={{ top: "50%", animation: "scan 1.6s ease-in-out infinite" }}
                      />
                    </div>
                  </div>

                  {isScanning && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#150b2a]/85 text-purple-100 text-xs px-3.5 py-1.5 rounded-xl backdrop-blur-md border border-purple-400/30 font-bold flex items-center gap-2 whitespace-nowrap shadow-lg">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                      <span>ضع الملصق أو الباركود داخل الإطار</span>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Quick Hardware Strip (Torch & Zoom - Outside Video) */}
              {(streamRef.current || supportsZoom) && !cameraError && (
                <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-0.5">
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
                      className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${
                        torchOn
                          ? "bg-amber-500/25 border-amber-400/60 text-amber-200"
                          : "bg-[#1e1136] border-purple-500/30 text-purple-200 hover:bg-[#2a174a]"
                      }`}
                    >
                      <span>{torchOn ? "🔦" : "💡"}</span>
                      <span>{torchOn ? "إيقاف الفلاش" : "تشغيل الفلاش"}</span>
                    </button>
                  )}

                  {/* Digital Zoom Stepper for Small Thermal Stickers */}
                  {supportsZoom && (
                    <div className="flex items-center gap-1 bg-[#1e1136] p-1 rounded-xl border border-purple-500/30 text-xs">
                      <span className="text-[11px] text-purple-300 font-bold px-1.5 whitespace-nowrap">تقريب:</span>
                      {[1, 1.5, 2].map((z) => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => handleSetZoom(z)}
                          className={`min-h-[32px] px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono tabular-nums transition-all whitespace-nowrap ${
                            Math.abs(zoomLevel - z) < 0.1
                              ? "bg-[#5b21b6] text-white border border-purple-400/40 shadow-xs"
                              : "text-purple-200 hover:bg-purple-900/40"
                          }`}
                        >
                          {z}×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Image Upload Tab ── */}
          {activeTab === "image" && (
            <div className="flex flex-col items-center gap-4">
              <div
                className="w-full border-2 border-dashed border-purple-500/40 bg-[#1e1136]/70 rounded-2xl p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-[#251542] transition-all"
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
                      className="max-h-36 rounded-xl object-contain border border-purple-500/30"
                    />
                    <p className="text-xs text-purple-200 font-mono truncate max-w-full">{imageFile.name}</p>
                  </div>
                ) : (
                  <>
                    <span className="text-4xl mb-2.5 block">🖼️</span>
                    <p className="text-sm font-extrabold text-white">اسحب صورة الباركود هنا أو انقر للاختيار</p>
                    <p className="text-xs text-purple-300/80 mt-1">يدعم الصيغ: JPG، PNG، WebP</p>
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
                <div className="flex items-center gap-2 text-purple-300 text-sm font-bold animate-pulse">
                  <span>🔍</span>
                  <span>جاري فك شيفرة الباركود من الصورة...</span>
                </div>
              )}
              {imageError && (
                <p className="text-red-300 bg-red-950/50 border border-red-500/30 px-4 py-2.5 rounded-xl text-xs font-bold text-center w-full">
                  {imageError}
                </p>
              )}
            </div>
          )}

          {/* ── Manual Entry Tab ── */}
          {activeTab === "manual" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2.5">
                <label className="text-sm font-extrabold text-purple-100">
                  أدخل رقم الباركود أو كود QR يدوياً
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualCode.trim().length >= 1) {
                        handleScannedCode(manualCode);
                      }
                    }}
                    placeholder="مثال: 6221234560001"
                    className="flex-1 px-4 py-3 rounded-2xl border border-purple-500/40 bg-[#1e1136] text-white placeholder-purple-300/40 text-base font-mono tabular-nums tracking-wider focus:outline-none focus:ring-2 focus:ring-purple-500 text-center"
                    inputMode="text"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-purple-300/80 text-center">
                  اكتب الرقم ثم اضغط Enter أو زر البحث أدناه
                </p>
              </div>
              <button
                type="button"
                onClick={() => manualCode.trim().length >= 1 && handleScannedCode(manualCode)}
                disabled={manualCode.trim().length < 1}
                className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-l from-[#5b21b6] to-[#7c3aed] hover:from-[#6d28d9] hover:to-[#8b5cf6] text-white font-extrabold text-sm sm:text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-950/60 whitespace-nowrap"
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

      {/* Camera Resolution & Frame Rate Settings Modal */}
      <CameraSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={cameraSettings}
        onSave={handleSaveCameraSettings}
      />
    </div>
  );
}
