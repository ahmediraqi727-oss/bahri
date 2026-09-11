"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { useData } from "@/lib/data-context";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
import { lookupByBarcode } from "@/lib/barcode-service";
import { decodeBarcodeFromCanvas, decodeBarcodeFromFile } from "@/lib/barcode-decoder";
import {
  buildTierBadgeText,
  resolveTierForQty,
  calculateTierPrice,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-engine";
import type { Product } from "@/lib/types";

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
      // High-pitched double beep for success
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === "warning") {
      // Medium dual tone for ignored URL / warning
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(330, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else {
      // Low buzz for error / out of stock
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

/**
 * Inspects a scanned string:
 * 1. Checks if it is an internal store link (e.g. ahmed-bahri.../product/123 or /qr/XYZ).
 *    Returns extracted code if internal.
 * 2. Checks if it is an external foreign web URL. Returns null if external.
 * 3. Returns raw code string if it's a standard barcode/QR code.
 */
export function processCodeFilter(rawCode: string): { isExternal: boolean; extractedCode: string } {
  const trimmed = rawCode.trim();
  const lower = trimmed.toLowerCase();

  // Internal link detection: Extract product ID or barcode from internal store URLs
  if (lower.includes("ahmed-bahri") || lower.includes("/qr/") || lower.includes("/product/")) {
    try {
      const urlObj = new URL(trimmed);
      const pathname = urlObj.pathname;
      const parts = pathname.split("/").filter(Boolean);
      // e.g. /qr/abc-123 or /product/abc-123
      const lastSegment = parts[parts.length - 1];
      if (lastSegment) {
        return { isExternal: false, extractedCode: decodeURIComponent(lastSegment) };
      }
    } catch {
      // Fall through to standard check
    }
  }

  // External web URL detection (http://, https://, ftp://, www., or foreign web domain extension)
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
  const { products, lookupProductByBarcode, getEffectiveTiers } = useData();
  const { addItem, items: cartItems } = useCart();
  const { settings } = useSettings();
  const globalPricingConfig = settings.pricingTiers ?? DEFAULT_PRICING_CONFIG;

  // Settings State
  const [cooldownMs, setCooldownMs] = useState<number>(1500); // 1.5 seconds per-code cooldown
  const [autoAdd, setAutoAdd] = useState<boolean>(true); // Auto add to cart on scan
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Scanner UI & Camera State
  const [isScanning, setIsScanning] = useState(false);
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

  // Per-Code Cooldown Tracker: Map<CodeString, LastTimestampMs>
  const codeCooldownMapRef = useRef<Map<string, number>>(new Map());
  // Frame Rate Throttling Ref (10-15 fps => 75ms-100ms throttle interval)
  const lastFrameTimeRef = useRef<number>(0);
  const FRAME_THROTTLE_MS = 80; // ~12.5 fps processing loop to eliminate high CPU load

  // Clear flash message timer
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showFlash = useCallback((text: string, type: "success" | "warning" | "error") => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMessage({ text, type });
    flashTimerRef.current = setTimeout(() => {
      setFlashMessage(null);
    }, 3000);
  }, []);

  // ─── Camera Stop & Cleanup ──────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
  }, []);

  // ─── Process & Add Product to Cart ──────────────────────────────────────────

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

  // ─── Core Code Processing Engine ───────────────────────────────────────────

  const handleDetectedCode = useCallback(
    async (rawCode: string) => {
      // 1. Browser Web Audio initialization on user interaction / scan
      getAudioContext();

      const cleanedRaw = rawCode.trim();
      if (!cleanedRaw) return;

      // 2. Per-Code Cooldown Check (مهلة التكرار المخصصة لكل منتج)
      const now = Date.now();
      const lastTime = codeCooldownMapRef.current.get(cleanedRaw) || 0;
      if (now - lastTime < cooldownMs) {
        // Ignore scan — identical code scanned within cooldown window!
        return;
      }
      // Update timestamp for this specific code
      codeCooldownMapRef.current.set(cleanedRaw, now);

      // 3. Smart URL Filter & Internal Code Extractor (فلترة وتصفية أكواد QR الذكية)
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

      // 4. Product Lookup (Instant memory lookup fallback to DB)
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

      // Found product
      setCurrentProduct(foundProduct);

      let added = false;
      if (foundProduct.stock <= 0) {
        if (soundEnabled) playScanBeep("error");
        showFlash(`⚠️ المنتج "${foundProduct.name}" نفد من المخزون!`, "error");
      } else if (autoAdd) {
        added = executeAddToCart(foundProduct, 1);
      } else if (soundEnabled) {
        playScanBeep("success");
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

  // ─── Throttled Video Frame Processing Loop (10-15 fps) ──────────────────────

  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const now = performance.now();
    // High-performance throttling to 10–15 fps (80ms interval) to save CPU/battery
    if (now - lastFrameTimeRef.current < FRAME_THROTTLE_MS) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    lastFrameTimeRef.current = now;

    const performDecode = async () => {
      // 1. Hardware BarcodeDetector API pass
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
        } catch { /* continue to canvas pass */ }
      }

      // 2. Canvas fallback pass
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const code = await decodeBarcodeFromCanvas(canvas);
          if (code) {
            handleDetectedCode(code);
          }
        }
      } catch { /* silent */ }

      rafRef.current = requestAnimationFrame(scanLoop);
    };

    performDecode();
  }, [handleDetectedCode]);

  // ─── Start Camera with Safe Feature Detection ────────────────────────────────

  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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

      // Safe Torch Capabilities Detection (تفادي أخطاء المتصفحات التي لا تدعم الفلاش)
      const track = stream.getVideoTracks()[0];
      if (track && "getCapabilities" in track) {
        try {
          // @ts-expect-error - getCapabilities check
          const caps = track.getCapabilities();
          setTorchSupported(!!caps?.torch);
        } catch {
          setTorchSupported(false);
        }
      } else {
        setTorchSupported(false);
      }

      setIsScanning(true);
      scanLoop();
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("تعذّر الوصول إلى الكاميرا. يرجى التأكد من منح الإذن للمتصفح.");
    }
  }, [facingMode, scanLoop]);

  // Toggle Torch safely
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

  // ─── Image Upload Decode ────────────────────────────────────────────────────

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

  // ─── Lifecycle & Subscriptions ──────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    if (activeTab === "camera" && canUseCamera) {
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab, canUseCamera, facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hardware Scanner Event Integration
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

  // Derived Pricing for current product
  const currentTiers = currentProduct ? getEffectiveTiers(currentProduct.id, globalPricingConfig) : [];
  const currentResolvedTier = currentProduct ? resolveTierForQty(currentQty, currentTiers) : null;
  const currentDisplayPrice = currentProduct && currentResolvedTier
    ? calculateTierPrice(currentProduct.retailPrice, currentResolvedTier)
    : currentProduct?.retailPrice ?? 0;
  const currentTierBadge = currentProduct ? buildTierBadgeText(currentTiers) : "";

  // Calculate scan logs totals
  const totalScannedCount = scanLogs.filter((l) => l.status === "success").length;
  const cartItemCount = useMemo(() => cartItems.reduce((acc, i) => acc + i.quantity, 0), [cartItems]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md transition-all duration-300 overflow-x-auto"
      dir="rtl"
      onClick={() => getAudioContext()}
    >
      {/* Modal Container — Fixed max height with flex layout */}
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] h-[92vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 animate-fadeIn max-w-full">

        {/* ── Header Bar ── */}
        <div className="bg-gradient-to-l from-blue-700 via-indigo-700 to-purple-800 px-4 sm:px-6 py-3.5 flex items-center justify-between shrink-0 text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl shrink-0 border border-white/20">
              ⚡
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg leading-tight flex items-center gap-2">
                <span>المسح السريع المزدوج</span>
                <span className="text-[10px] bg-blue-500/40 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full font-mono">
                  Dual-Pane
                </span>
              </h2>
              <p className="text-blue-200 text-xs hidden sm:block">
                كاميرا مستمرة + إضافة فورية للسلة + فلترة QR الرابط الذكية
              </p>
            </div>
          </div>

          {/* Quick Scanner Controls & Stats */}
          <div className="flex items-center gap-3">
            {/* Auto-Add Toggle */}
            <label className="hidden md:flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl cursor-pointer transition-all border border-white/20 text-xs font-bold">
              <input
                type="checkbox"
                checked={autoAdd}
                onChange={(e) => setAutoAdd(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-400 cursor-pointer"
              />
              <span>إضافة آلية للسلة 🛒</span>
            </label>

            {/* Cooldown Duration Selector */}
            <div className="hidden sm:flex items-center gap-1.5 bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/20 text-xs font-bold">
              <span className="text-blue-200">المهلة:</span>
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

            {/* Audio Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-base transition-all border ${
                soundEnabled ? "bg-white/20 border-white/30 text-yellow-300" : "bg-white/5 border-white/10 text-gray-400"
              }`}
              title={soundEnabled ? "الصوت مفعل" : "الصوت مكتوم"}
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>

            {/* Close Modal */}
            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Global Flash Message Toast Notification */}
        {flashMessage && (
          <div
            className={`px-4 py-2 text-xs sm:text-sm font-bold text-center transition-all animate-fadeIn shrink-0 flex items-center justify-center gap-2 ${
              flashMessage.type === "success"
                ? "bg-green-600 text-white"
                : flashMessage.type === "warning"
                ? "bg-amber-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            <span>{flashMessage.text}</span>
          </div>
        )}

        {/* ── Main Dual-Pane Body ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-gray-200 dark:divide-gray-800 overflow-hidden">

          {/* ════════════════════════════════════════════════════════════════
              PANE 1: Active Continuous Live Camera Stream
             ════════════════════════════════════════════════════════════════ */}
          <div className="p-4 sm:p-5 flex flex-col bg-gray-950 text-white min-h-0 overflow-y-auto">

            {/* Scanner Tab Selectors */}
            <div className="flex items-center gap-2 mb-3 shrink-0">
              {canUseCamera && (
                <button
                  onClick={() => setActiveTab("camera")}
                  className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === "camera"
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-gray-800 hover:bg-gray-750 text-gray-300"
                  }`}
                >
                  <span>📷</span>
                  <span>كاميرا حية دائمة</span>
                </button>
              )}
              {canUseImageUpload && (
                <button
                  onClick={() => {
                    stopCamera();
                    setActiveTab("upload");
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === "upload"
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-gray-800 hover:bg-gray-750 text-gray-300"
                  }`}
                >
                  <span>🖼</span>
                  <span>رفع صورة</span>
                </button>
              )}
              {canUseManualEntry && (
                <button
                  onClick={() => {
                    stopCamera();
                    setActiveTab("manual");
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === "manual"
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-gray-800 hover:bg-gray-750 text-gray-300"
                  }`}
                >
                  <span>⌨</span>
                  <span>إدخال يدوي</span>
                </button>
              )}
            </div>

            {/* ── Camera Stream Display ── */}
            {activeTab === "camera" && (
              <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
                {cameraError ? (
                  <div className="bg-red-950/60 border border-red-800 rounded-2xl p-6 text-center max-w-md my-auto">
                    <p className="text-red-400 font-bold text-sm mb-3">{cameraError}</p>
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all"
                    >
                      إعادة محاولة الاتصال بالكاميرا
                    </button>
                  </div>
                ) : (
                  <div className="relative w-full h-full min-h-[260px] rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-gray-800">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                      autoPlay
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Viewfinder Target Reticle */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-64 h-44 border-2 border-blue-400/90 rounded-2xl relative shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-xl" />
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-xl" />
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-xl" />
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-xl" />

                        {/* Animated Scan Line */}
                        <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_10px_#60a5fa] animate-pulse" style={{ top: "50%" }} />
                      </div>
                    </div>

                    {/* Live Scanner Badge */}
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-emerald-400 text-[11px] font-bold px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>الكاميرا حية وتعمل مستمراً</span>
                    </div>

                    {/* Facing Mode Switch & Flash Controls */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
                      <button
                        onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))}
                        className="bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5 transition-all"
                      >
                        🔄 {facingMode === "environment" ? "الكاميرا الخلفية" : "الكاميرا الأمامية"}
                      </button>

                      {torchSupported && (
                        <button
                          onClick={toggleTorch}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border backdrop-blur-md flex items-center gap-1.5 transition-all ${
                            torchOn
                              ? "bg-yellow-400 text-yellow-950 border-yellow-300"
                              : "bg-black/60 hover:bg-black/80 text-white border-white/20"
                          }`}
                        >
                          <span>{torchOn ? "🔦" : "💡"}</span>
                          <span>{torchOn ? "إيقاف الفلاش" : "تشغيل الفلاش"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Image Upload Tab Display ── */}
            {activeTab === "upload" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-gray-800 rounded-2xl bg-gray-900/50">
                <span className="text-5xl mb-3">🖼</span>
                <h4 className="font-bold text-sm text-gray-200 mb-1">تحميل صورة باركود أو QR</h4>
                <p className="text-xs text-gray-400 mb-4">اختر صورة واضحة يحتوي عليها الكود من جهازك</p>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-lg"
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
                {imageDecoding && <p className="text-xs text-blue-400 animate-pulse mt-3">جاري تحليل وفك شفرة الصورة...</p>}
              </div>
            )}

            {/* ── Manual Entry Tab Display ── */}
            {activeTab === "manual" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-900/50 rounded-2xl border border-gray-800">
                <h4 className="font-bold text-sm text-gray-200 mb-3">أدخل الكود أو الباركود يدوياً</h4>
                <div className="w-full max-w-sm flex flex-col gap-3">
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
                    placeholder="رمز الباركود أو المعرف..."
                    className="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-white font-mono text-center text-sm focus:outline-none focus:border-blue-500"
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
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-lg"
                  >
                    مسح ومعالجة الكود 🔍
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════════════
              PANE 2: Interactive Real-Time Side Panel & Session History Log
             ════════════════════════════════════════════════════════════════ */}
          <div className="p-4 sm:p-5 flex flex-col bg-gray-50 dark:bg-gray-900 min-h-0 overflow-y-auto">

            {/* ── Top Card: Active Scanned Product Display ── */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 mb-4 shrink-0">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3 mb-3">
                <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  المنتج الحالي المقروء
                </span>
                {currentCode && (
                  <span className="font-mono text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 rounded-lg">
                    📷 {currentCode}
                  </span>
                )}
              </div>

              {!currentProduct ? (
                <div className="py-8 text-center text-gray-400">
                  <span className="text-4xl block mb-2 opacity-50">🔍</span>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    ضع الباركود أمام الكاميرا لمسحه فوراً
                  </p>
                  {currentCode && (
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <p className="text-xs text-red-500 font-bold">لم يُعثر على منتج بهذا الكود</p>
                      {onRequestLink && (
                        <button
                          onClick={() => onRequestLink(currentCode)}
                          className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                        >
                          🔗 ربط بمنتج
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  {/* Product Image */}
                  <div className="relative w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden shrink-0 border border-gray-200 dark:border-gray-600">
                    {currentProduct.image ? (
                      <Image
                        src={currentProduct.image}
                        alt={currentProduct.name}
                        fill
                        sizes="100px"
                        className="object-contain p-1"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                    )}
                  </div>

                  {/* Product Info & Quantity Stepper */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-sm text-gray-900 dark:text-white truncate mb-1">
                      {currentProduct.name}
                    </h3>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                        {currentDisplayPrice.toLocaleString()} د.ع
                      </span>
                      {currentTierBadge && (
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                          {currentTierBadge}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        currentProduct.stock > 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                      }`}>
                        {currentProduct.stock > 0 ? `المخزون: ${currentProduct.stock}` : "نفد"}
                      </span>
                    </div>

                    {/* Quantity Adjustment & Direct Add Button */}
                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700">
                        <button
                          onClick={() => setCurrentQty((q) => Math.max(1, q - 1))}
                          className="px-2.5 py-1 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          −
                        </button>
                        <span className="px-3 font-mono font-extrabold text-xs text-gray-900 dark:text-white">
                          {currentQty}
                        </span>
                        <button
                          onClick={() => setCurrentQty((q) => q + 1)}
                          className="px-2.5 py-1 text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => executeAddToCart(currentProduct, currentQty)}
                        disabled={currentProduct.stock <= 0}
                        className="flex-1 py-1.5 px-3 bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>🛒</span>
                        <span>أضف بالسعر التراكمي ({(currentDisplayPrice * currentQty).toLocaleString()} د.ع)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Bottom Section: Session Scan Stream / History Log ── */}
            <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
              <div className="px-4 py-3 bg-gray-100 dark:bg-gray-750 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs text-gray-700 dark:text-gray-300">
                    سجل عمليات المسح والجلسة الحالية
                  </span>
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {totalScannedCount} عملية
                  </span>
                </div>
                {scanLogs.length > 0 && (
                  <button
                    onClick={() => setScanLogs([])}
                    className="text-[11px] font-bold text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                  >
                    مسح السجل 🗑
                  </button>
                )}
              </div>

              {/* Internal Vertical Scroll for Log Items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {scanLogs.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-xs">
                    لم تتم أي عملية مسح في هذه الجلسة بعد
                  </div>
                ) : (
                  scanLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                        log.status === "success"
                          ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40"
                          : log.status === "ignored_url"
                          ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40"
                          : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base shrink-0">
                          {log.status === "success"
                            ? "✅"
                            : log.status === "ignored_url"
                            ? "⚠️"
                            : "❌"}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white truncate">
                            {log.product ? log.product.name : log.message || log.code}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                            <span>{log.code}</span>
                            <span>•</span>
                            <span>{log.timestamp}</span>
                          </div>
                        </div>
                      </div>

                      {log.product && (
                        <button
                          onClick={() => executeAddToCart(log.product!, 1)}
                          disabled={log.product.stock <= 0}
                          className="px-2.5 py-1 bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-gray-200 dark:border-gray-600 rounded-lg font-bold text-[11px] shrink-0 transition-all"
                        >
                          +1 للسلة
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Log Footer Summary Bar */}
              <div className="p-3 bg-gray-50 dark:bg-gray-850 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0 text-xs font-bold text-gray-700 dark:text-gray-300">
                <span>إجمالي قطع السلة الحالية: <span className="text-blue-600 dark:text-blue-400 font-extrabold">{cartItemCount}</span></span>
                <button
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all text-xs"
                >
                  إتمام الشراء / إغلاق
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
