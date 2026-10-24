"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { useData } from "@/lib/data-context";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
import { lookupByBarcode } from "@/lib/barcode-service";
import { decodeBarcodeFromCanvas, decodeBarcodeFromFile, decodeThermalOptimizedQR } from "@/lib/barcode-decoder";
import { triggerSuccessSensoryFeedback, triggerToggleFeedback } from "@/lib/sensory-feedback";
import {
  loadSavedCameraSettings,
  saveCameraSettings,
  CAMERA_RESOLUTIONS,
  type CameraSettingsState,
} from "@/lib/camera-config";
import CameraSettingsModal from "@/components/CameraSettingsModal";
import {
  buildTierBadgeText,
  resolveTierForQty,
  calculateTierPrice,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-engine";
import type { Product } from "@/lib/types";
import ProgressiveProductImage from "@/components/ProgressiveProductImage";

// ─── Interfaces & Types ────────────────────────────────────────────────────────

export interface ScannedLogEntry {
  id: string;
  code: string;
  timestamp: string;
  status: "success" | "ignored_url" | "not_found" | "out_of_stock";
  product?: Product;
  qty: number;
  addedToCart: boolean;
  message?: string;
}

export interface DualPaneFastScannerProps {
  isOpen: boolean;
  onClose: () => void;
  canUseCamera?: boolean;
  canUseImageUpload?: boolean;
  canUseManualEntry?: boolean;
  onProductAdded?: (product: Product, qty: number) => void;
  onRequestLink?: (code: string) => void;
}

// ─── Web Audio API Beep Generator (Browser Safe) ──────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => { /* user interaction required */ });
  }
  return audioCtx;
}

function playScanBeep(type: "success" | "warning" | "error" = "success") {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === "warning") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(330, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch {
    /* silent fallback if browser blocks audio */
  }
}

// ─── URL Code Filter & Internal Code Extractor ────────────────────────────────

export function processCodeFilter(rawCode: string): { isExternal: boolean; extractedCode: string } {
  const trimmed = rawCode.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes("ahmed-bahri") || lower.includes("/qr/") || lower.includes("/product/")) {
    try {
      const urlObj = new URL(trimmed);
      const pathname = urlObj.pathname;
      const parts = pathname.split("/").filter(Boolean);
      const lastSegment = parts[parts.length - 1];
      if (lastSegment) {
        return { isExternal: false, extractedCode: decodeURIComponent(lastSegment) };
      }
    } catch {
      // Fall through to standard check
    }
  }

  const isWebScheme = /^(https?:\/\/|ftp:\/\/|www\.)/i.test(trimmed);
  const isWebDomain = /\.(com|org|net|gov|edu|io|co|me|site|app|dev|link|xyz|info)\b/i.test(trimmed) && trimmed.includes("/");

  if (isWebScheme || isWebDomain) {
    return { isExternal: true, extractedCode: trimmed };
  }

  return { isExternal: false, extractedCode: trimmed };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DualPaneFastScanner({
  isOpen,
  onClose,
  canUseCamera = true,
  canUseImageUpload = true,
  canUseManualEntry = true,
  onProductAdded,
  onRequestLink,
}: DualPaneFastScannerProps) {
  const { lookupProductByBarcode, getEffectiveTiers } = useData();
  const { addItem, items: cartItems } = useCart();
  const { settings } = useSettings();
  const globalPricingConfig = settings.pricingTiers ?? DEFAULT_PRICING_CONFIG;

  // Settings State
  const [cooldownMs, setCooldownMs] = useState<number>(1500);
  const [autoAdd, setAutoAdd] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Camera Resolution & Frame Rate Settings (Low-End Device Optimization)
  const [cameraSettings, setCameraSettings] = useState<CameraSettingsState>(loadSavedCameraSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const toggleSensoryFeedback = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) triggerToggleFeedback();
      return next;
    });
  }, []);

  // Scanner UI & Camera State
  const [cameraError, setCameraError] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [manualCode, setManualCode] = useState("");
  const [activeTab, setActiveTab] = useState<"camera" | "upload" | "manual">("camera");

  // Current Product & Scan Stream State
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [currentCode, setCurrentCode] = useState<string>("");
  const [currentQty, setCurrentQty] = useState<number>(1);
  const [scanLogs, setScanLogs] = useState<ScannedLogEntry[]>([]);
  const [flashMessage, setFlashMessage] = useState<{ text: string; type: "success" | "warning" | "error" } | null>(null);
  const [imageDecoding, setImageDecoding] = useState(false);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const codeCooldownMapRef = useRef<Map<string, number>>(new Map());
  const lastFrameTimeRef = useRef<number>(0);
  const FRAME_THROTTLE_MS = 80;

  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showFlash = useCallback((text: string, type: "success" | "warning" | "error") => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMessage({ text, type });
    flashTimerRef.current = setTimeout(() => {
      setFlashMessage(null);
    }, 3000);
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch { /* silent */ }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
  }, []);

  const executeAddToCart = useCallback(
    (prod: Product, qtyToAdd: number) => {
      if (prod.stock <= 0) {
        if (soundEnabled) playScanBeep("error");
        showFlash(`⚠️ المنتج "${prod.name}" نفد من المخزون (0 قطعة)!`, "error");
        return false;
      }

      const tiers = getEffectiveTiers(prod.id, globalPricingConfig);
      addItem({
        productId: prod.id,
        name: prod.name,
        image: prod.image,
        retailPrice: prod.retailPrice,
        wholesalePrice: prod.wholesalePrice,
        quantity: qtyToAdd,
        tiers,
      });

      if (soundEnabled) playScanBeep("success");
      showFlash(`✅ تم إضافة ${qtyToAdd} قطعة من "${prod.name}" إلى السلة`, "success");
      onProductAdded?.(prod, qtyToAdd);
      return true;
    },
    [addItem, getEffectiveTiers, globalPricingConfig, onProductAdded, showFlash, soundEnabled]
  );

  const handleDetectedCode = useCallback(
    async (rawCode: string) => {
      getAudioContext();

      const cleanedRaw = rawCode.trim();
      if (!cleanedRaw) return;

      const now = Date.now();
      const lastTime = codeCooldownMapRef.current.get(cleanedRaw) || 0;
      if (now - lastTime < cooldownMs) {
        return;
      }
      codeCooldownMapRef.current.set(cleanedRaw, now);

      const { isExternal, extractedCode } = processCodeFilter(cleanedRaw);

      if (isExternal) {
        if (soundEnabled) playScanBeep("warning");
        showFlash(`⚠️ تم تجاهل كود QR لرابط موقع خارجي (${extractedCode.slice(0, 30)}...)`, "warning");

        const logEntry: ScannedLogEntry = {
          id: Math.random().toString(36).substring(2, 9),
          code: cleanedRaw,
          timestamp: new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          status: "ignored_url",
          qty: 1,
          addedToCart: false,
          message: "رابط موقع خارجي تم تجاهله",
        };
        setScanLogs((prev) => [logEntry, ...prev.slice(0, 49)]);
        return;
      }

      setCurrentCode(extractedCode);
      setCurrentQty(1);

      let foundProduct = lookupProductByBarcode(extractedCode);
      if (!foundProduct) {
        foundProduct = await lookupByBarcode(extractedCode);
      }

      const timestampStr = new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      if (!foundProduct) {
        if (soundEnabled) playScanBeep("error");
        showFlash(`❌ لم يتم العثور على منتج للكود: ${extractedCode}`, "error");
        setCurrentProduct(null);

        const logEntry: ScannedLogEntry = {
          id: Math.random().toString(36).substring(2, 9),
          code: extractedCode,
          timestamp: timestampStr,
          status: "not_found",
          qty: 1,
          addedToCart: false,
          message: "غير مرتبط بمنتج في المتجر",
        };
        setScanLogs((prev) => [logEntry, ...prev.slice(0, 49)]);
        return;
      }

      setCurrentProduct(foundProduct);

      let added = false;
      if (foundProduct.stock <= 0) {
        if (soundEnabled) playScanBeep("error");
        showFlash(`⚠️ المنتج "${foundProduct.name}" نفد من المخزون!`, "error");
      } else if (autoAdd) {
        added = executeAddToCart(foundProduct, 1);
        triggerSuccessSensoryFeedback(soundEnabled);
      } else if (soundEnabled) {
        triggerSuccessSensoryFeedback(true);
      }

      const logEntry: ScannedLogEntry = {
        id: Math.random().toString(36).substring(2, 9),
        code: extractedCode,
        timestamp: timestampStr,
        status: foundProduct.stock <= 0 ? "out_of_stock" : "success",
        product: foundProduct,
        qty: 1,
        addedToCart: added,
      };
      setScanLogs((prev) => [logEntry, ...prev.slice(0, 49)]);
    },
    [cooldownMs, lookupProductByBarcode, autoAdd, executeAddToCart, showFlash, soundEnabled]
  );

  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const currentThrottle = Math.max(25, Math.round(1000 / (cameraSettings.fps || 30)));
    const now = performance.now();
    if (now - lastFrameTimeRef.current < currentThrottle) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    lastFrameTimeRef.current = now;

    const performDecode = async () => {
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          // @ts-expect-error — BarcodeDetector API
          const detector = new window.BarcodeDetector({
            formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e", "data_matrix", "aztec", "pdf417"],
          });
          const detected = await detector.detect(video);
          if (detected && detected.length > 0 && detected[0].rawValue) {
            handleDetectedCode(detected[0].rawValue);
            rafRef.current = requestAnimationFrame(scanLoop);
            return;
          }
        } catch { /* continue */ }
      }

      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const code = await decodeThermalOptimizedQR(canvas);
          if (code) {
            handleDetectedCode(code);
          }
        }
      } catch { /* silent */ }

      rafRef.current = requestAnimationFrame(scanLoop);
    };

    performDecode();
  }, [handleDetectedCode, cameraSettings.fps]);

  const startCamera = useCallback(
    async (targetSettings = cameraSettings, targetFacing = facingMode) => {
      setCameraError("");

      if (typeof window !== "undefined" && window.isSecureContext === false) {
        setCameraError("يتطلب تشغيل الكاميرا اتصالاً مشفراً وآمناً (HTTPS).");
        return;
      }
      if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError("متصفحك الحالي لا يدعم واجهة الوصول المباشر للكاميرا (MediaDevices API).");
        return;
      }

      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => {
            try { t.stop(); } catch { /* silent */ }
          });
          streamRef.current = null;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));

        const resConfig = CAMERA_RESOLUTIONS[targetSettings.resolution] || CAMERA_RESOLUTIONS["720p"];
        const targetFps = targetSettings.fps || 30;

        let stream: MediaStream | null = null;
        try {
          const constraints: MediaStreamConstraints = {
            video: {
              facingMode: targetFacing === "user" ? "user" : { ideal: targetFacing },
              width: { ideal: resConfig.width },
              height: { ideal: resConfig.height },
              frameRate: { ideal: targetFps, max: targetFps },
            },
            audio: false,
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (stage1Err) {
          console.warn("DualPane Stage 1 constraints failed, attempting relaxed Stage 2:", stage1Err);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: targetFacing === "user" ? "user" : "environment",
              },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
        }

        if (!stream) {
          throw new Error("تعذّر بدء بث الفيديو من الكاميرا.");
        }

        streamRef.current = stream;

        if (videoRef.current) {
          const video = videoRef.current;
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          video.muted = true;
          video.srcObject = stream;

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
            console.warn("DualPane video.play() error (handled):", playErr);
          }
        }

        const track = stream.getVideoTracks()[0];
        if (track && "getCapabilities" in track) {
          try {
            const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
            setTorchSupported(!!caps?.torch);
          } catch {
            setTorchSupported(false);
          }
        } else {
          setTorchSupported(false);
        }

        scanLoop();
      } catch (err: unknown) {
        console.error("Camera access error:", err);
        const errorObj = err as { name?: string; message?: string };
        if (errorObj?.name === "NotAllowedError" || errorObj?.name === "PermissionDeniedError") {
          setCameraError("تم رفض إذن الوصول للكاميرا من قبل المتصفح. يرجى تفعيل الكاميرا من إعدادات الموقع 🔒.");
        } else {
          setCameraError("تعذّر الوصول إلى الكاميرا. يرجى التأكد من منح الإذن للمتصفح.");
        }
      }
    },
    [cameraSettings, facingMode, scanLoop]
  );

  const handleSaveCameraSettings = useCallback(
    (newSettings: CameraSettingsState) => {
      setCameraSettings(newSettings);
      saveCameraSettings(newSettings);
      startCamera(newSettings, facingMode);
    },
    [facingMode, startCamera]
  );

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    try {
      await (track as MediaStreamTrack & { applyConstraints: (c: object) => Promise<void> })
        .applyConstraints({ advanced: [{ torch: !torchOn } as object] } as object);
      setTorchOn(!torchOn);
    } catch (err) {
      console.warn("Torch failed:", err);
    }
  };

  const handleImageFile = async (file: File) => {
    setImageDecoding(true);
    try {
      const code = await decodeBarcodeFromFile(file);
      if (code) {
        handleDetectedCode(code);
      } else {
        showFlash("❌ لم يتم التعرف على أي باركود أو QR في الصورة المرفوقة", "error");
      }
    } catch (err) {
      console.error("Image decode failed:", err);
      showFlash("حدث خطأ أثناء فك تشفير الصورة", "error");
    }
    setImageDecoding(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    if (activeTab === "camera" && canUseCamera) {
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab, canUseCamera, facingMode, startCamera, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;

    const handleHardwareEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ code: string }>).detail;
      if (detail?.code) {
        handleDetectedCode(detail.code);
      }
    };

    window.addEventListener("barcode_hardware_scanned", handleHardwareEvent);
    window.addEventListener("barcode_scanned", handleHardwareEvent);
    return () => {
      window.removeEventListener("barcode_hardware_scanned", handleHardwareEvent);
      window.removeEventListener("barcode_scanned", handleHardwareEvent);
    };
  }, [isOpen, handleDetectedCode]);

  const currentTiers = currentProduct ? getEffectiveTiers(currentProduct.id, globalPricingConfig) : [];
  const currentResolvedTier = currentProduct ? resolveTierForQty(currentQty, currentTiers) : null;
  const currentDisplayPrice = currentProduct && currentResolvedTier
    ? calculateTierPrice(currentProduct.retailPrice, currentResolvedTier)
    : currentProduct?.retailPrice ?? 0;
  const currentTierBadge = currentProduct ? buildTierBadgeText(currentTiers) : "";

  const totalScannedCount = scanLogs.filter((l) => l.status === "success").length;
  const cartItemCount = useMemo(() => cartItems.reduce((acc, i) => acc + i.quantity, 0), [cartItems]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-5 bg-black/80 backdrop-blur-md transition-all duration-300"
      dir="rtl"
      onClick={() => getAudioContext()}
    >
      {/* ── إطار مركزي متناسق ومستقل بالسمة البنفسجية الفاخرة (شاشة ثنائية الجانب) ── */}
      <div className="relative bg-[#130924] text-white rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.85)] w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-purple-500/30 animate-fadeIn">

        {/* ── Header Bar ── */}
        <div className="bg-gradient-to-l from-[#3b0764] via-[#4c1d95] to-[#5b21b6] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 text-white border-b border-purple-400/20 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 backdrop-blur-md flex items-center justify-center text-lg shrink-0 border border-purple-300/30 shadow-inner">
              ⚡
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-sm sm:text-base leading-tight flex flex-wrap items-center gap-2">
                <span className="truncate">المسح السريع المزدوج</span>
                <span className="text-[10px] bg-purple-950/70 text-purple-200 border border-purple-400/30 px-2.5 py-0.5 rounded-lg font-mono whitespace-nowrap">
                  Dual-Pane POS
                </span>
              </h2>
              <p className="text-[11px] text-purple-200/80 truncate mt-0.5">
                مسح متواصل بالوقت الفعلي مع إضافة فورية للسلة
              </p>
            </div>
          </div>

          {/* Quick Session Controls (No duplicate camera/sound buttons here) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="flex items-center gap-2 bg-purple-950/50 hover:bg-purple-900/60 px-3 py-1.5 rounded-xl cursor-pointer transition-all border border-purple-400/30 text-xs font-bold whitespace-nowrap">
              <input
                type="checkbox"
                checked={autoAdd}
                onChange={(e) => setAutoAdd(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 accent-purple-400 cursor-pointer"
              />
              <span>إضافة آلية للسلة 🛒</span>
            </label>

            <div className="hidden sm:flex items-center gap-1.5 bg-purple-950/50 px-3 py-1.5 rounded-xl border border-purple-400/30 text-xs font-bold whitespace-nowrap">
              <span className="text-purple-200">المهلة:</span>
              <select
                value={cooldownMs}
                onChange={(e) => setCooldownMs(Number(e.target.value))}
                className="bg-transparent text-white font-extrabold focus:outline-none cursor-pointer"
              >
                <option value={1000} className="text-gray-900">1 ثانية</option>
                <option value={1500} className="text-gray-900">1.5 ثانية</option>
                <option value={2000} className="text-gray-900">2 ثانية</option>
                <option value={3000} className="text-gray-900">3 ثوانٍ</option>
              </select>
            </div>

            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-red-500/80 border border-white/15 flex items-center justify-center text-white font-bold transition-all shrink-0 cursor-pointer"
              title="إغلاق"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Flash Message Toast */}
        {flashMessage && (
          <div
            className={`px-4 py-2 text-xs font-bold text-center transition-all animate-fadeIn shrink-0 ${
              flashMessage.type === "success"
                ? "bg-emerald-600 text-white"
                : flashMessage.type === "warning"
                ? "bg-amber-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            <span>{flashMessage.text}</span>
          </div>
        )}

        {/* ── التخطيط ثنائي الجانب الدائم: الكاميرا في اليمين والمنتج في اليسار جنباً إلى جنب ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-purple-500/20 overflow-hidden bg-[#130924]">

          {/* ════════════════════════════════════════════════════════════════
              الجانب الأيمن (PANEL A): الكاميرا الحية النشطة مع شريط التحكم الموحد
             ════════════════════════════════════════════════════════════════ */}
          <div className="p-4 flex flex-col bg-[#0e061a] text-white min-h-0 overflow-y-auto">

            {/* Scanner Tab Selectors */}
            <div className="grid grid-cols-3 gap-2 mb-3 shrink-0 bg-[#1a0d2e] p-1.5 rounded-2xl border border-purple-500/20">
              {canUseCamera && (
                <button
                  onClick={() => setActiveTab("camera")}
                  className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === "camera"
                      ? "bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] text-white shadow-md border border-purple-400/30"
                      : "text-purple-200/75 hover:text-white hover:bg-purple-900/30"
                  }`}
                >
                  <span>📷</span>
                  <span>كاميرا حية</span>
                </button>
              )}
              {canUseImageUpload && (
                <button
                  onClick={() => { stopCamera(); setActiveTab("upload"); }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === "upload"
                      ? "bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] text-white shadow-md border border-purple-400/30"
                      : "text-purple-200/75 hover:text-white hover:bg-purple-900/30"
                  }`}
                >
                  <span>🖼</span>
                  <span>رفع صورة</span>
                </button>
              )}
              {canUseManualEntry && (
                <button
                  onClick={() => { stopCamera(); setActiveTab("manual"); }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === "manual"
                      ? "bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] text-white shadow-md border border-purple-400/30"
                      : "text-purple-200/75 hover:text-white hover:bg-purple-900/30"
                  }`}
                >
                  <span>⌨</span>
                  <span>إدخال يدوي</span>
                </button>
              )}
            </div>

            {/* Camera Stream Display */}
            {activeTab === "camera" && (
              <div className="barcode-scanner-container flex-1 flex flex-col min-h-[280px] gap-2.5">
                {/* ── Unified Camera Control Toolbar (Outside Video) ── */}
                <div className="bg-[#1b0e30] border border-purple-500/25 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-inner">
                  {/* Live Status Indicator */}
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-purple-950/60 border border-purple-500/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span className="text-[11px] font-bold text-emerald-300 whitespace-nowrap">
                      مسح مستمر نشط
                    </span>
                  </div>

                  {/* Unified Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Flip Camera */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = facingMode === "environment" ? "user" : "environment";
                        setFacingMode(next);
                        startCamera(cameraSettings, next);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#2a1747] hover:bg-[#3b2163] text-purple-100 border border-purple-400/25 text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 cursor-pointer"
                      title="تبديل الكاميرا (أمامية / خلفية)"
                    >
                      <span>🔄</span>
                      <span>{facingMode === "environment" ? "خلفية" : "أمامية"}</span>
                    </button>

                    {/* Sensory Feedback (Sound & Vibration) Single Toggle */}
                    <button
                      type="button"
                      onClick={toggleSensoryFeedback}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 cursor-pointer ${
                        soundEnabled
                          ? "bg-emerald-600/25 border-emerald-400/40 text-emerald-200 hover:bg-emerald-600/35"
                          : "bg-[#24133d] border-purple-500/20 text-purple-300/70 hover:text-purple-200"
                      }`}
                      title={soundEnabled ? "الصوت والاهتزاز مفعل - اضغط للإيقاف" : "الصوت والاهتزاز صامت - اضغط للتفعيل"}
                    >
                      <span>{soundEnabled ? "🔊" : "🔇"}</span>
                      <span>{soundEnabled ? "صوت واهتزاز" : "صامت"}</span>
                    </button>

                    {/* Torch / Flash */}
                    {torchSupported && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 cursor-pointer ${
                          torchOn
                            ? "bg-amber-500 text-amber-950 border-amber-300 shadow-sm"
                            : "bg-[#24133d] border-purple-500/20 text-purple-200 hover:bg-[#311b52]"
                        }`}
                      >
                        <span>{torchOn ? "🔦 فلاش مفعل" : "💡 الفلاش"}</span>
                      </button>
                    )}

                    {/* Camera Resolution & FPS Settings */}
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(true)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 cursor-pointer ${
                        cameraSettings.resolution === "480p" && cameraSettings.fps === 15
                          ? "bg-amber-500/25 border-amber-400/50 text-amber-200"
                          : "bg-[#2a1747] hover:bg-[#3b2163] border-purple-400/25 text-purple-100"
                      }`}
                      title="إعدادات دقة وسرعة الكاميرا"
                    >
                      <span>⚙️</span>
                      <span>{cameraSettings.resolution} • {cameraSettings.fps}fps</span>
                    </button>
                  </div>
                </div>

                {/* ── Clean Video Viewport (Zero Floating Controls Inside) ── */}
                {cameraError ? (
                  <div className="bg-red-950/50 border border-red-500/40 rounded-2xl p-5 text-center max-w-sm m-auto">
                    <p className="text-red-300 font-bold text-xs mb-3 leading-relaxed">{cameraError}</p>
                    <button
                      onClick={() => startCamera()}
                      className="px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
                    >
                      إعادة محاولة الاتصال بالكاميرا
                    </button>
                  </div>
                ) : (
                  <div className="relative flex-1 w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-purple-500/30 shadow-inner min-h-[220px]">
                    <video
                      ref={videoRef}
                      className={`w-full h-full object-cover transition-transform ${facingMode === "user" ? "-scale-x-100" : ""}`}
                      playsInline
                      muted
                      autoPlay
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Clean Reticle Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-56 h-36 border-2 border-purple-400/90 rounded-2xl relative shadow-[0_0_25px_rgba(168,85,247,0.35)]">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-purple-400 rounded-tl-lg" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-purple-400 rounded-tr-lg" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-purple-400 rounded-bl-lg" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-purple-400 rounded-br-lg" />
                        <div
                          className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent shadow-[0_0_8px_#c084fc] animate-pulse"
                          style={{ top: "50%" }}
                        />
                      </div>
                    </div>

                    {/* Subtle Instruction Caption */}
                    <div className="absolute bottom-2.5 inset-x-0 flex justify-center pointer-events-none px-3">
                      <span className="bg-black/65 backdrop-blur-xs text-purple-100 text-[11px] font-medium px-3 py-1 rounded-lg border border-purple-400/20">
                        ضع الباركود أو رمز QR داخل الإطار البنفسجي للمسح الفوري
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Image Upload Tab */}
            {activeTab === "upload" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-purple-500/30 rounded-2xl bg-[#1a0d2e]/60">
                <span className="text-4xl mb-2">🖼</span>
                <h4 className="font-bold text-sm text-purple-100 mb-1">تحميل صورة باركود أو QR</h4>
                <p className="text-xs text-purple-300/75 mb-4">اختر صورة واضحة من جهازك لفحصها وإضافتها للسلة</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] hover:from-[#5b21b6] hover:to-[#6d28d9] text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                >
                  اختر ملف صورة
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                />
                {imageDecoding && <p className="text-xs text-purple-300 animate-pulse mt-3">جاري فك شفرة الصورة...</p>}
              </div>
            )}

            {/* Manual Entry Tab */}
            {activeTab === "manual" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#1a0d2e]/60 rounded-2xl border border-purple-500/25">
                <h4 className="font-bold text-sm text-purple-100 mb-3">أدخل الكود أو الباركود يدوياً</h4>
                <div className="w-full max-w-xs flex flex-col gap-3">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualCode.trim()) {
                        handleDetectedCode(manualCode);
                        setManualCode("");
                      }
                    }}
                    placeholder="رمز الباركود..."
                    className="w-full px-3.5 py-2.5 bg-[#0e061a] border border-purple-500/35 rounded-xl text-white font-mono text-center text-xs focus:outline-none focus:border-purple-400"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (manualCode.trim()) {
                        handleDetectedCode(manualCode);
                        setManualCode("");
                      }
                    }}
                    disabled={!manualCode.trim()}
                    className="w-full py-2.5 bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] hover:from-[#5b21b6] hover:to-[#6d28d9] disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                  >
                    معالجة الكود 🔍
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════════════
              الجانب الأيسر (PANEL B): تفاصيل المنتج المقروء وسجل الجلسة والسلة
             ════════════════════════════════════════════════════════════════ */}
          <div className="p-4 flex flex-col bg-[#160b2b] text-white min-h-0 overflow-y-auto">

            {/* Current Scanned Product Card */}
            <div className="bg-[#1f103a] rounded-2xl p-3.5 shadow-md border border-purple-500/25 mb-3 shrink-0">
              <div className="flex items-center justify-between border-b border-purple-500/20 pb-2 mb-2.5">
                <span className="text-[11px] font-extrabold text-purple-300 uppercase tracking-wider">
                  المنتج المقروء حالياً
                </span>
                {currentCode && (
                  <span className="font-mono text-[11px] font-bold bg-purple-950/80 text-purple-200 px-2.5 py-0.5 rounded-lg border border-purple-400/30">
                    📷 {currentCode}
                  </span>
                )}
              </div>

              {!currentProduct ? (
                <div className="py-6 text-center text-purple-300/60">
                  <span className="text-3xl block mb-1.5 opacity-60">📦</span>
                  <p className="text-xs font-bold text-purple-200/80">
                    ضع الباركود أمام الكاميرا لمسحه وتحديث السلة فوراً
                  </p>
                  {currentCode && onRequestLink && (
                    <button
                      onClick={() => onRequestLink(currentCode)}
                      className="mt-3 px-4 py-1.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      🔗 ربط بمنتج جديد
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <ProgressiveProductImage
                    src={currentProduct.image}
                    thumbnailSrc={currentProduct.thumbnailUrl}
                    blurDataUrl={currentProduct.blurDataUrl}
                    productId={currentProduct.id}
                    alt={currentProduct.name}
                    mode="thumbnail"
                    priority
                    containerClassName="w-16 h-16 rounded-xl shrink-0 border border-purple-400/30"
                    imgClassName="object-cover"
                    fallbackTextClassName="text-xl"
                  />

                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-xs text-white truncate mb-1">
                      {currentProduct.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-sm font-extrabold text-purple-300">
                        {currentDisplayPrice.toLocaleString()} د.ع
                      </span>
                      {currentTierBadge && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-400/30 font-bold px-2 py-0.5 rounded-lg">
                          {currentTierBadge}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center border border-purple-400/30 rounded-xl overflow-hidden bg-[#130924]">
                        <button
                          onClick={() => setCurrentQty((q) => Math.max(1, q - 1))}
                          className="px-2.5 py-1 text-xs font-bold text-purple-200 hover:bg-purple-900/50 cursor-pointer"
                        >
                          −
                        </button>
                        <span className="px-2.5 font-mono font-extrabold text-xs text-white">
                          {currentQty}
                        </span>
                        <button
                          onClick={() => setCurrentQty((q) => q + 1)}
                          className="px-2.5 py-1 text-xs font-bold text-purple-300 hover:bg-purple-900/50 cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => executeAddToCart(currentProduct, currentQty)}
                        disabled={currentProduct.stock <= 0}
                        className="flex-1 py-1.5 px-3 bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] hover:from-[#5b21b6] hover:to-[#6d28d9] disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <span>🛒</span>
                        <span>أضف للسلة ({(currentDisplayPrice * currentQty).toLocaleString()} د.ع)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Session History Stream */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#1f103a] rounded-2xl border border-purple-500/25 overflow-hidden">
              <div className="px-3.5 py-2.5 bg-[#271547] flex items-center justify-between border-b border-purple-500/20 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs text-purple-100">
                    سجل عمليات الجلسة الحالية
                  </span>
                  <span className="bg-[#7c3aed] text-white text-[10px] font-bold px-2 py-0.5 rounded-lg">
                    {totalScannedCount}
                  </span>
                </div>
                {scanLogs.length > 0 && (
                  <button
                    onClick={() => setScanLogs([])}
                    className="text-[11px] font-bold text-purple-300 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    مسح السجل 🗑
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-0">
                {scanLogs.length === 0 ? (
                  <div className="py-8 text-center text-purple-300/50 text-xs">
                    لم تتم أي عملية مسح في هذه الجلسة بعد
                  </div>
                ) : (
                  scanLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                        log.status === "success"
                          ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-100"
                          : log.status === "ignored_url"
                          ? "bg-amber-950/30 border-amber-500/30 text-amber-100"
                          : "bg-red-950/30 border-red-500/30 text-red-100"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">
                          {log.status === "success" ? "✅" : log.status === "ignored_url" ? "⚠️" : "❌"}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-white truncate text-xs">
                            {log.product ? log.product.name : log.message || log.code}
                          </p>
                          <span className="text-[10px] text-purple-300/70 font-mono">{log.timestamp}</span>
                        </div>
                      </div>

                      {log.product && (
                        <button
                          onClick={() => executeAddToCart(log.product!, 1)}
                          disabled={log.product.stock <= 0}
                          className="px-2.5 py-1 bg-[#2d1854] hover:bg-[#3d2270] text-purple-200 border border-purple-400/30 rounded-lg font-bold text-[10px] shrink-0 transition-all cursor-pointer"
                        >
                          +1 للسلة
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Footer Summary Bar */}
              <div className="p-3 bg-[#271547] border-t border-purple-500/20 flex items-center justify-between shrink-0 text-xs font-bold text-purple-100">
                <span>إجمالي السلة: <span className="text-purple-300 font-extrabold">{cartItemCount}</span> قطعة</span>
                <button
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="px-4 py-1.5 bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] hover:from-[#5b21b6] hover:to-[#6d28d9] text-white rounded-xl font-bold transition-all text-xs cursor-pointer shadow-sm"
                >
                  إتمام الشراء / إغلاق
                </button>
              </div>

            </div>

          </div>
        </div>

      </div>

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
