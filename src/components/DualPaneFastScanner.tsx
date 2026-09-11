"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { useData } from "@/lib/data-context";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
import { lookupByBarcode } from "@/lib/barcode-service";
import { decodeBarcodeFromCanvas } from "@/lib/barcode-decoder";
import {
  buildTierBadgeText,
  resolveTierForQty,
  calculateTierPrice,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-engine";
import type { Product } from "@/lib/types";

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
  canUseManualEntry?: boolean;
  onProductAdded?: (product: Product, qty: number) => void;
  onRequestLink?: (code: string) => void;
}

let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) audioCtx = new AudioCtxClass();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
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
  } catch {}
}

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
    } catch {}
  }

  const isWebScheme = /^(https?:\/\/|ftp:\/\/|www\.)/i.test(trimmed);
  const isWebDomain = /\.(com|org|net|gov|edu|io|co|me|site|app|dev|link|xyz|info)\b/i.test(trimmed) && trimmed.includes("/");

  if (isWebScheme || isWebDomain) {
    return { isExternal: true, extractedCode: trimmed };
  }

  return { isExternal: false, extractedCode: trimmed };
}

export default function DualPaneFastScanner({
  isOpen,
  onClose,
  canUseCamera = true,
  canUseManualEntry = true,
  onProductAdded,
  onRequestLink,
}: DualPaneFastScannerProps) {
  const { lookupProductByBarcode, getEffectiveTiers } = useData();
  const { addItem, items: cartItems } = useCart();
  const { settings } = useSettings();
  const globalPricingConfig = settings.pricingTiers ?? DEFAULT_PRICING_CONFIG;

  const [cooldownMs, setCooldownMs] = useState<number>(1200);
  const [autoAdd, setAutoAdd] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const [cameraError, setCameraError] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [manualCode, setManualCode] = useState("");

  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [currentCode, setCurrentCode] = useState<string>("");
  const [currentQty, setCurrentQty] = useState<number>(1);
  const [scanLogs, setScanLogs] = useState<ScannedLogEntry[]>([]);
  const [flashMessage, setFlashMessage] = useState<{ text: string; type: "success" | "warning" | "error" } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const codeCooldownMapRef = useRef<Map<string, number>>(new Map());
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showFlash = useCallback((text: string, type: "success" | "warning" | "error") => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMessage({ text, type });
    flashTimerRef.current = setTimeout(() => { setFlashMessage(null); }, 2500);
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
  }, []);

  const executeAddToCart = useCallback(
    (prod: Product, qtyToAdd: number) => {
      if (prod.stock <= 0) {
        if (soundEnabled) playScanBeep("error");
        showFlash(`⚠️ المنتج "${prod.name}" نفد من المخزون!`, "error");
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
      showFlash(`✅ تم إضافة ${qtyToAdd} قطعة من "${prod.name}"`, "success");
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
      if (now - lastTime < cooldownMs) return;
      codeCooldownMapRef.current.set(cleanedRaw, now);

      const { isExternal, extractedCode } = processCodeFilter(cleanedRaw);

      if (isExternal) {
        if (soundEnabled) playScanBeep("warning");
        showFlash(`⚠️ تم تجاهل رابط خارجي`, "warning");
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
        showFlash(`❌ لم يُعثر على منتج للكود: ${extractedCode}`, "error");
        setCurrentProduct(null);
        return;
      }

      setCurrentProduct(foundProduct);

      let added = false;
      if (foundProduct.stock > 0 && autoAdd) {
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

  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const performDecode = async () => {
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          // @ts-expect-error — BarcodeDetector API
          const detector = new window.BarcodeDetector({
            formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"],
          });
          const detected = await detector.detect(video);
          if (detected && detected.length > 0 && detected[0].rawValue) {
            handleDetectedCode(detected[0].rawValue);
            rafRef.current = requestAnimationFrame(scanLoop);
            return;
          }
        } catch {}
      }

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
      } catch {}

      rafRef.current = requestAnimationFrame(scanLoop);
    };

    performDecode();
  }, [handleDetectedCode]);

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

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.srcObject = stream;
        await video.play();
      }

      const track = stream.getVideoTracks()[0];
      if (track && "getCapabilities" in track) {
        try {
          // @ts-expect-error - getCapabilities check
          const caps = track.getCapabilities();
          setTorchSupported(!!caps?.torch);
        } catch {
          setTorchSupported(false);
        }
      }

      scanLoop();
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("تعذّر الوصول إلى الكاميرا. يرجى السماح للمتصفح بالوصول.");
    }
  }, [facingMode, scanLoop]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    try {
      await (track as MediaStreamTrack & { applyConstraints: (c: object) => Promise<void> })
        .applyConstraints({ advanced: [{ torch: !torchOn } as object] } as object);
      setTorchOn(!torchOn);
    } catch (err) {}
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    if (canUseCamera) {
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen, canUseCamera, facingMode, startCamera, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ code: string }>).detail;
      if (detail?.code) handleDetectedCode(detail.code);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md" dir="rtl">
      {/* إطار مركزي متناسق يجمع الكاميرا يمين والمنتج يسار بشكل دائم */}
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">

        {/* Header Bar */}
        <div className="bg-gradient-to-l from-blue-700 via-indigo-700 to-purple-800 px-4 py-3 flex items-center justify-between shrink-0 text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">⚡</div>
            <h2 className="font-extrabold text-sm sm:text-base">المسح السريع المزدوج (Dual-Pane Fast Scanner)</h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="hidden sm:flex items-center gap-2 bg-white/15 px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={autoAdd}
                onChange={(e) => setAutoAdd(e.target.checked)}
                className="w-4 h-4 accent-blue-400"
              />
              <span>إضافة آلية للسلة 🛒</span>
            </label>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-sm"
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>
            <button
              onClick={() => { stopCamera(); onClose(); }}
              className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {flashMessage && (
          <div className={`px-4 py-1.5 text-xs font-bold text-center ${flashMessage.type === "success" ? "bg-green-600 text-white" : flashMessage.type === "warning" ? "bg-amber-600 text-white" : "bg-red-600 text-white"}`}>
            {flashMessage.text}
          </div>
        )}

        {/* ── التخطيط ثنائي الجانب الدائم: الكاميرا في اليمين والمنتج في اليسار جنباً إلى جنب ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-gray-200 dark:divide-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-900">

          {/* ════════════════════════════════════════════════════════════════
              الجانب الأيمن (PANEL A): الكاميرا الحية النشطة المستمرة
             ════════════════════════════════════════════════════════════════ */}
          <div className="p-4 flex flex-col bg-gray-950 text-white min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                كاميرا حية دائمة النشاط
              </span>
              {canUseManualEntry && (
                <div className="flex items-center gap-1 w-1/2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && manualCode.trim()) { handleDetectedCode(manualCode); setManualCode(""); }}}
                    placeholder="إدخال يدوي سريع..."
                    className="w-full px-2.5 py-1 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-xs"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative min-h-[280px]">
              {cameraError ? (
                <div className="bg-red-950/60 border border-red-800 rounded-2xl p-4 text-center">
                  <p className="text-red-400 font-bold text-xs mb-2">{cameraError}</p>
                  <button onClick={startCamera} className="px-3 py-1 bg-blue-600 rounded-xl text-xs font-bold">إعادة المحاولة</button>
                </div>
              ) : (
                <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-gray-800 shadow-inner">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-56 h-36 border-2 border-blue-400 rounded-2xl relative shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                      <div className="absolute inset-x-2 h-0.5 bg-blue-400 animate-pulse" style={{ top: "50%" }} />
                    </div>
                  </div>

                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <button
                      onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))}
                      className="bg-black/60 text-white text-[11px] font-bold px-2.5 py-1 rounded-xl border border-white/20"
                    >
                      🔄 {facingMode === "environment" ? "الخلفية" : "الأمامية"}
                    </button>
                    {torchSupported && (
                      <button
                        onClick={toggleTorch}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border ${torchOn ? "bg-yellow-400 text-yellow-950" : "bg-black/60 text-white"}`}
                      >
                        {torchOn ? "🔦 إيقاف الفلاش" : "💡 تشغيل الفلاش"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              الجانب الأيسر (PANEL B): تفاصيل المنتج المقروء وسجل الجلسة والسلة
             ════════════════════════════════════════════════════════════════ */}
          <div className="p-4 flex flex-col bg-white dark:bg-gray-900 min-h-0 overflow-y-auto">

            {/* تفاصيل المنتج المقروء حالياً */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3.5 shadow-xs border border-gray-200 dark:border-gray-700 mb-3 shrink-0">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                <span className="text-[11px] font-extrabold text-gray-500 uppercase">المنتج المقروء حالياً</span>
                {currentCode && (
                  <span className="font-mono text-[11px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-200">
                    {currentCode}
                  </span>
                )}
              </div>

              {!currentProduct ? (
                <div className="py-6 text-center text-gray-400">
                  <span className="text-3xl block mb-1 opacity-50">📦</span>
                  <p className="text-xs font-bold text-gray-500">قم بمسح أي باركود لتظهر تفاصيله هنا فوراً</p>
                  {currentCode && onRequestLink && (
                    <button
                      onClick={() => onRequestLink(currentCode)}
                      className="mt-2 px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                    >
                      🔗 ربط بمنتج جديد
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="relative w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden shrink-0 border border-gray-200">
                    {currentProduct.image ? (
                      <Image src={currentProduct.image} alt={currentProduct.name} fill sizes="80px" className="object-contain p-1" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-xs text-gray-900 dark:text-white truncate mb-1">{currentProduct.name}</h3>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-extrabold text-blue-600">{currentDisplayPrice.toLocaleString()} د.ع</span>
                      {currentTierBadge && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">{currentTierBadge}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white dark:bg-gray-700">
                        <button onClick={() => setCurrentQty((q) => Math.max(1, q - 1))} className="px-2 py-0.5 text-xs font-bold">−</button>
                        <span className="px-2 font-mono font-extrabold text-xs">{currentQty}</span>
                        <button onClick={() => setCurrentQty((q) => q + 1)} className="px-2 py-0.5 text-xs font-bold text-blue-600">+</button>
                      </div>

                      <button
                        onClick={() => executeAddToCart(currentProduct, currentQty)}
                        disabled={currentProduct.stock <= 0}
                        className="flex-1 py-1.5 px-3 bg-gradient-to-l from-blue-600 to-indigo-600 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1"
                      >
                        <span>🛒</span>
                        <span>أضف للسلة ({(currentDisplayPrice * currentQty).toLocaleString()} د.ع)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* سجل العمليات والسلة */}
            <div className="flex-1 flex flex-col min-h-0 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3.5 py-2 bg-gray-100 dark:bg-gray-750 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 shrink-0">
                <span className="font-extrabold text-xs text-gray-700 dark:text-gray-300">سجل عمليات الجلسة الحالية ({totalScannedCount})</span>
                {scanLogs.length > 0 && (
                  <button onClick={() => setScanLogs([])} className="text-[11px] font-bold text-gray-500 hover:text-red-500">مسح السجل 🗑</button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-0">
                {scanLogs.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-xs">لم تتم أي عملية مسح بعد</div>
                ) : (
                  scanLogs.map((log) => (
                    <div key={log.id} className="p-2 rounded-xl border text-xs flex items-center justify-between bg-green-50/50 dark:bg-green-950/20 border-green-200">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm">✅</span>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white truncate text-xs">{log.product ? log.product.name : log.code}</p>
                          <span className="text-[10px] text-gray-500 font-mono">{log.timestamp}</span>
                        </div>
                      </div>
                      {log.product && (
                        <button onClick={() => executeAddToCart(log.product!, 1)} className="px-2 py-1 bg-white dark:bg-gray-700 text-blue-600 rounded-lg font-bold text-[10px]">
                          +1 للسلة
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="p-2.5 bg-gray-100 dark:bg-gray-850 border-t border-gray-200 flex items-center justify-between shrink-0 text-xs font-bold text-gray-700 dark:text-gray-300">
                <span>إجمالي السلة: <span className="text-blue-600 font-extrabold">{cartItemCount}</span> قطعة</span>
                <button onClick={() => { stopCamera(); onClose(); }} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold">
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
