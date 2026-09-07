"use client";

/**
 * ThermalLabelPrinter.tsx
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Production-Grade Thermal Label Rasterization & Print Subsystem             ║
 * ║  Ahmed Bahri Store — Enterprise Component                                    ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Installation: npm install html-to-image                                    ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Strategy:                                                                   ║
 * ║    html-to-image rasterizes the live DOM preview div at 4× pixel ratio      ║
 * ║    into a PNG data URL. A clean popup window injects zero-margin @media     ║
 * ║    print CSS matching the exact roll mm dimensions, embeds the PNG, and     ║
 * ║    triggers window.print() automatically.                                   ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  WHY THIS APPROACH:                                                          ║
 * ║    ✅ 100% visual parity — DOM preview IS the printed output                 ║
 * ║    ✅ Arabic BiDi handled natively (dir="rtl" + lang="ar")                   ║
 * ║    ✅ No manual glyph shaping / BiDi reversal needed for the DOM layer       ║
 * ║    ✅ Barcodes, QR codes, logos, colors captured pixel-perfectly             ║
 * ║    ✅ 4× pixelRatio ≈ 384dpi — exceeds typical 203dpi thermal heads          ║
 * ║    ✅ Web Share API fallback for iOS Safari / Android Chrome                 ║
 * ║    ✅ Batch printing: multiple products × quantity per product                ║
 * ║    ✅ CORS-safe: prefetches images to data URLs before rasterization         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { Product } from "@/lib/types";
import type {
  LabelCustomizationOptions,
  LabelElementId,
} from "@/lib/printer-service";
import {
  DEFAULT_LABEL_ELEMENT_ORDER,
  generateBarcodeDataURL,
  generateQRDataURL,
  resolveQRPayload,
} from "@/lib/printer-service";

// ─── Constants ────────────────────────────────────────────────────────────────

/** 1mm in CSS pixels at 96dpi */
const MM_TO_PX_96DPI = 3.7795275591;

/**
 * Pixel ratio used for html-to-image rasterization.
 * 4× at 96dpi screen preview → effectively 384dpi output image.
 * This comfortably exceeds 203–300dpi thermal print head resolution.
 */
const RASTER_PIXEL_RATIO = 4;

/** Maximum preview panel size in pixels */
const MAX_PREVIEW_PX = 290;

// ─── Public Types ─────────────────────────────────────────────────────────────

/** A single item in a batch print job */
export interface PrintBatchItem {
  product: Product;
  quantity: number;
}

export interface ThermalLabelPrinterProps {
  /** Primary product displayed in the live preview panel */
  product: Product;
  /** Full label customization config from the Thermal Studio */
  customization: LabelCustomizationOptions;
  /**
   * Optional batch list for multi-product printing.
   * When provided, printBatch() rasterizes each product independently
   * and sends all copies to a single thermal print job.
   */
  batchItems?: PrintBatchItem[];
  /** Called when rasterization starts */
  onRasterizeStart?: () => void;
  /** Called after each label rasterization (receives the PNG data URL) */
  onRasterizeComplete?: (dataUrl: string) => void;
  /** Called on any rasterization or print error */
  onError?: (err: Error) => void;
  /** Extra CSS class for the outer wrapper div */
  className?: string;
}

/** Imperative handle exposed to parent components via forwardRef */
export interface ThermalLabelPrinterHandle {
  /** Rasterize the current preview product and open the thermal print popup */
  print: () => Promise<void>;
  /** Rasterize the current preview product and download as a 4× PNG file */
  downloadPNG: () => Promise<void>;
  /** Returns the current PNG data URL without printing or downloading */
  rasterize: () => Promise<string>;
  /**
   * Batch print — rasterizes each item in batchItems (or falls back to [product × 1])
   * and sends all copies to a single clean print popup.
   */
  printBatch: (items?: PrintBatchItem[]) => Promise<void>;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Converts any image URL to a base64 data URL to sidestep CORS tainting
 * that would prevent html-to-image from capturing external <img> elements.
 * Returns the original URL on failure (graceful degradation).
 */
async function fetchImageAsDataUrl(url: string): Promise<string> {
  if (!url) return "";
  if (url.startsWith("data:")) return url; // already a data URL
  if (url.startsWith("/") || url.startsWith(window.location.origin)) return url; // same-origin

  try {
    const res = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!res.ok) return url;
    const blob = await res.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // Network/CORS failure — let html-to-image try its own mechanism
  }
}

/** Converts a PNG data URL to a Blob (used by Web Share API on mobile) */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ─── LabelPreviewDOM ──────────────────────────────────────────────────────────
// This is the EXACT DOM node that html-to-image captures.
// Every pixel in this component is what appears on the thermal label.

interface LabelPreviewDOMProps {
  product: Product;
  customization: LabelCustomizationOptions;
  barcodeUrl: string;   // base64 data URL
  qrUrl: string;        // base64 data URL
  safeLogoUrl: string;  // CORS-safe data URL or same-origin path
  /** mm → px scale factor (3.78 at 96dpi; reduced for the UI preview panel) */
  scale?: number;
}

function LabelPreviewDOM({
  product,
  customization,
  barcodeUrl,
  qrUrl,
  safeLogoUrl,
  scale = MM_TO_PX_96DPI,
}: LabelPreviewDOMProps) {
  const isCircle = customization.labelShape === "circle";
  const isSquare  = customization.labelShape === "square";
  const widthMM   = customization.rollWidthMM;
  const heightMM  = isCircle || isSquare ? widthMM : customization.rollHeightMM;
  const widthPx   = Math.round(widthMM * scale);
  const heightPx  = Math.round(heightMM * scale);

  const activeOrder: LabelElementId[] =
    customization.elementOrder && customization.elementOrder.length > 0
      ? customization.elementOrder
      : DEFAULT_LABEL_ELEMENT_ORDER;

  const hasBarcode   = Boolean(customization.showBarcode && barcodeUrl);
  const hasQR        = Boolean((customization.showQRCode || customization.showStoreURLQR) && qrUrl);
  const hasLogo      = Boolean(customization.showLogo && safeLogoUrl);
  const isWatermark  = customization.logoPosition === "background_watermark";

  const containerStyle: React.CSSProperties = {
    width:           `${widthPx}px`,
    height:          `${heightPx}px`,
    backgroundColor: customization.labelBgColor || "#ffffff",
    border:          `1px solid ${customization.borderColor || "#cbd5e1"}`,
    borderRadius:    isCircle ? "50%" : "4px",
    display:         "flex",
    flexDirection:   "column",
    alignItems:      "center",
    justifyContent:  "space-evenly",
    // Circular safe-area padding: content must stay inside 70.7% of diameter
    padding: isCircle
      ? `${Math.round(heightPx * 0.15)}px ${Math.round(widthPx * 0.1)}px`
      : "6px 8px",
    overflow:        "hidden",
    boxSizing:       "border-box",
    position:        "relative",
    fontFamily:      "system-ui, -apple-system, Arial, sans-serif",
  };

  return (
    <div style={containerStyle} dir="rtl" lang="ar">

      {/* Background watermark logo */}
      {hasLogo && isWatermark && (
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0.13, pointerEvents: "none", padding: "10%",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={safeLogoUrl} alt="" crossOrigin="anonymous"
            style={{ maxWidth: "80%", maxHeight: "80%", objectFit: "contain" }} />
        </div>
      )}

      {/* Positioned logo (top-left / top-center / top-right) */}
      {hasLogo && !isWatermark && (
        <div
          style={{
            width: "100%", flexShrink: 0, marginBottom: "3px",
            display: "flex",
            justifyContent:
              customization.logoPosition === "top_left"  ? "flex-start" :
              customization.logoPosition === "top_right" ? "flex-end"   : "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={safeLogoUrl} alt="Brand Logo" crossOrigin="anonymous"
            style={{
              height: `${Math.min(customization.logoSizePx || 36, heightPx * 0.22)}px`,
              maxWidth: "100%", objectFit: "contain",
            }}
          />
        </div>
      )}

      {/* Dynamic elements in user-defined order */}
      {activeOrder.map((elemId) => {

        // ── Product Name ─────────────────────────────────────────────────────
        if (elemId === "name" && customization.showProductName && product.name) {
          return (
            <div key="name" dir="rtl" lang="ar"
              style={{
                fontSize: `${Math.max(7, customization.nameFontSize)}px`,
                fontWeight: 800,
                color: customization.textColor || "#0f172a",
                textAlign: "center",
                lineHeight: 1.25,
                wordBreak: "break-word",
                width: "100%",
                flexShrink: 0,
              }}
            >
              {product.name}
            </div>
          );
        }

        // ── Product Price (IQD) ──────────────────────────────────────────────
        if (elemId === "price" && customization.showProductPrice && product.retailPrice) {
          return (
            <div key="price"
              style={{
                fontSize: `${Math.max(8, customization.priceFontSize)}px`,
                fontWeight: 900,
                color: customization.textColor || "#2563eb",
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {product.retailPrice.toLocaleString("ar-IQ")} IQD
            </div>
          );
        }

        // ── Barcodes (1D + QR) ───────────────────────────────────────────────
        if (elemId === "codes" && (hasBarcode || hasQR)) {
          return (
            <div key="codes"
              style={{
                display: "flex",
                flexDirection: hasBarcode && hasQR ? "row" : "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                width: "100%",
                flexShrink: 0,
              }}
            >
              {hasBarcode && (
                <div style={{ flex: hasQR ? 1 : undefined, display: "flex", alignItems: "center", justifyContent: "center", maxWidth: "100%", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={barcodeUrl} alt="Barcode"
                    style={{
                      height: `${Math.min(customization.barcodeHeight, heightPx * 0.28)}px`,
                      maxWidth: "100%", objectFit: "contain", display: "block",
                    }}
                  />
                </div>
              )}
              {hasQR && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="QR Code"
                    style={{
                      width:  `${Math.min(customization.qrSizePx || 56, heightPx * 0.28)}px`,
                      height: `${Math.min(customization.qrSizePx || 56, heightPx * 0.28)}px`,
                      objectFit: "contain", display: "block",
                    }}
                  />
                </div>
              )}
            </div>
          );
        }

        // ── Footer Text / Store Tagline ──────────────────────────────────────
        if (elemId === "footer" && customization.showFooterText && customization.footerText) {
          return (
            <div key="footer" dir="rtl" lang="ar"
              style={{
                fontSize: "9px",
                fontWeight: "bold",
                color: customization.textColor || "#64748b",
                textAlign: "center",
                borderTop: `1px solid ${customization.borderColor || "#e2e8f0"}`,
                paddingTop: "3px",
                width: "100%",
                wordBreak: "break-word",
                flexShrink: 0,
              }}
            >
              {customization.footerText}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ─── Main ThermalLabelPrinter Component ──────────────────────────────────────

const ThermalLabelPrinter = forwardRef<
  ThermalLabelPrinterHandle,
  ThermalLabelPrinterProps
>(function ThermalLabelPrinter(
  { product, customization, batchItems, onRasterizeStart, onRasterizeComplete, onError, className },
  ref
) {
  // ── Refs & state ──────────────────────────────────────────────────────────
  const previewRef = useRef<HTMLDivElement>(null);
  const [barcodeUrl,  setBarcodeUrl]  = useState<string>("");
  const [qrUrl,       setQrUrl]       = useState<string>("");
  const [safeLogoUrl, setSafeLogoUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg,   setStatusMsg]   = useState<string>("");

  // ── Derived label dimensions ──────────────────────────────────────────────
  const isCircle = customization.labelShape === "circle";
  const isSquare  = customization.labelShape === "square";
  const wMM = customization.rollWidthMM;
  const hMM = isCircle || isSquare ? wMM : customization.rollHeightMM;

  // Scale the preview to fit MAX_PREVIEW_PX — never upscale beyond native 96dpi
  const previewScale = Math.min(MAX_PREVIEW_PX / wMM, MAX_PREVIEW_PX / hMM, MM_TO_PX_96DPI);

  // ── Effect: 1D Barcode data URL ───────────────────────────────────────────
  useEffect(() => {
    if (product.barcode && customization.showBarcode) {
      setBarcodeUrl(
        generateBarcodeDataURL(product.barcode, customization.barcodeHeight, customization.barcodeType || "CODE128")
      );
    } else {
      setBarcodeUrl("");
    }
  }, [product.barcode, customization.showBarcode, customization.barcodeHeight, customization.barcodeType]);

  // ── Effect: 2D QR code data URL ───────────────────────────────────────────
  useEffect(() => {
    const payload = resolveQRPayload(product, customization);
    if (payload && (customization.showQRCode || customization.showStoreURLQR)) {
      generateQRDataURL(payload, customization.qrErrorCorrection || "M").then(setQrUrl);
    } else {
      setQrUrl("");
    }
  }, [product, customization.showQRCode, customization.showStoreURLQR, customization.qrTargetMode, customization.qrErrorCorrection, customization.storeUrl]);

  // ── Effect: CORS-safe logo data URL ──────────────────────────────────────
  // html-to-image fails silently on cross-origin <img> elements that are
  // not pre-converted to data URLs. We fetch & convert upfront.
  useEffect(() => {
    if (customization.showLogo && customization.logoUrl) {
      fetchImageAsDataUrl(customization.logoUrl).then(setSafeLogoUrl);
    } else {
      setSafeLogoUrl("");
    }
  }, [customization.showLogo, customization.logoUrl]);

  // ── Core rasterization engine ─────────────────────────────────────────────
  /**
   * Captures the live DOM preview node as a 4× PNG data URL using html-to-image.
   *
   * Lazy import: html-to-image is only bundled when the user triggers a print/download action,
   * keeping the initial JS payload lean.
   */
  const rasterize = useCallback(async (): Promise<string> => {
    if (!previewRef.current) {
      throw new Error("[ThermalLabelPrinter] Preview DOM ref is not mounted.");
    }

    const { toPng } = await import("html-to-image");
    onRasterizeStart?.();
    setIsProcessing(true);
    setStatusMsg("جاري التقاط معاينة الملصق بدقة 4×...");

    try {
      const dataUrl = await toPng(previewRef.current, {
        /**
         * pixelRatio: 4
         *   The preview renders at 96dpi (CSS screen resolution).
         *   Capturing at 4× multiplies the output to ~384dpi effective resolution.
         *   This guarantees razor-sharp barcodes and Arabic glyphs when printed
         *   on a 203dpi or 300dpi thermal print head.
         */
        pixelRatio: RASTER_PIXEL_RATIO,

        /**
         * cacheBust: true
         *   Appends a timestamp query param to image src URLs so the browser
         *   re-fetches them with correct CORS headers rather than serving a
         *   potentially tainted (and unclonable) cached response.
         */
        cacheBust: true,

        // Explicit white background prevents translucent PNG artifacts
        backgroundColor: customization.labelBgColor || "#ffffff",

        // Skip elements annotated with data-thermal-ignore="true"
        filter: (node: HTMLElement) => !node.dataset?.["thermalIgnore"],
      });

      onRasterizeComplete?.(dataUrl);
      return dataUrl;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
      throw error;
    } finally {
      setIsProcessing(false);
      setStatusMsg("");
    }
  }, [customization.labelBgColor, onRasterizeStart, onRasterizeComplete, onError]);

  // ── Off-screen rasterization (for batch products) ─────────────────────────
  /**
   * Creates a hidden off-screen React root, renders a LabelPreviewDOM into it,
   * rasterizes it with html-to-image at full 96dpi scale (then 4× pixelRatio),
   * and tears down the root.
   *
   * Used in batch mode for products other than the preview product.
   */
  const rasterizeProduct = useCallback(
    async (targetProduct: Product, targetCustomization: LabelCustomizationOptions): Promise<string> => {
      const { toPng } = await import("html-to-image");

      // ── Build assets for this product ──────────────────────────────────────
      let pBarcodeUrl = "";
      if (targetProduct.barcode && targetCustomization.showBarcode) {
        pBarcodeUrl = generateBarcodeDataURL(
          targetProduct.barcode, targetCustomization.barcodeHeight, targetCustomization.barcodeType || "CODE128"
        );
      }

      let pQrUrl = "";
      const qrPayload = resolveQRPayload(targetProduct, targetCustomization);
      if (qrPayload && (targetCustomization.showQRCode || targetCustomization.showStoreURLQR)) {
        pQrUrl = await generateQRDataURL(qrPayload, targetCustomization.qrErrorCorrection || "M");
      }

      let pLogoUrl = "";
      if (targetCustomization.showLogo && targetCustomization.logoUrl) {
        pLogoUrl = await fetchImageAsDataUrl(targetCustomization.logoUrl);
      }

      // ── Compute pixel dimensions at full 96dpi scale ────────────────────────
      const pIsCircle = targetCustomization.labelShape === "circle";
      const pIsSquare  = targetCustomization.labelShape === "square";
      const pWidthMM   = targetCustomization.rollWidthMM;
      const pHeightMM  = pIsCircle || pIsSquare ? pWidthMM : targetCustomization.rollHeightMM;
      const pWidthPx   = Math.round(pWidthMM  * MM_TO_PX_96DPI);
      const pHeightPx  = Math.round(pHeightMM * MM_TO_PX_96DPI);

      // ── Mount off-screen container ─────────────────────────────────────────
      const container = document.createElement("div");
      container.style.cssText = [
        "position:fixed",
        "top:-9999px",
        "left:-9999px",
        `width:${pWidthPx}px`,
        `height:${pHeightPx}px`,
        "pointer-events:none",
        "z-index:-999",
        "overflow:hidden",
      ].join(";");
      document.body.appendChild(container);

      const { createRoot } = await import("react-dom/client");
      const root = createRoot(container);

      // ── Render the label DOM and wait for images to decode ─────────────────
      await new Promise<void>((resolve) => {
        root.render(
          <LabelPreviewDOM
            product={targetProduct}
            customization={targetCustomization}
            barcodeUrl={pBarcodeUrl}
            qrUrl={pQrUrl}
            safeLogoUrl={pLogoUrl}
            scale={MM_TO_PX_96DPI}
          />
        );
        // requestAnimationFrame + 120ms gives React time to commit and images to load
        requestAnimationFrame(() => setTimeout(resolve, 120));
      });

      try {
        const labelNode = container.firstElementChild as HTMLElement;
        return await toPng(labelNode, {
          pixelRatio: RASTER_PIXEL_RATIO,
          cacheBust: true,
          backgroundColor: targetCustomization.labelBgColor || "#ffffff",
        });
      } finally {
        // Always clean up to prevent DOM / memory leaks
        root.unmount();
        document.body.removeChild(container);
      }
    },
    []
  );

  // ── Build print-popup HTML string ─────────────────────────────────────────
  /**
   * Produces a self-contained HTML document for the popup print window.
   *
   * Screen view:  Dark preview card — shows each label image with caption.
   * @media print: Each .label-page becomes one thermal die-cut label.
   *               @page declares exact mm dimensions.
   *               .label-img is positioned fixed top:0 left:0 and fills the page.
   *               All UI chrome is hidden.
   */
  const buildPrintPopupHtml = useCallback(
    (images: Array<{ dataUrl: string; productName: string; quantity: number }>): string => {
      const isCircleLabel = customization.labelShape === "circle";

      const allCopies = images.flatMap(({ dataUrl, productName, quantity }) =>
        Array.from({ length: quantity }, (_, i) => ({
          dataUrl, productName,
          copyLabel: quantity > 1 ? ` — نسخة ${i + 1} من ${quantity}` : "",
        }))
      );

      const totalCopies = allCopies.length;

      const pages = allCopies
        .map(({ dataUrl, productName, copyLabel }, idx) => {
          const isLastPage = idx === allCopies.length - 1;
          return `
<div class="label-page"${!isLastPage ? ' style="page-break-after:always;"' : ""}>
  <img class="label-img" src="${dataUrl}" alt="${productName.replace(/"/g, "&quot;")}" loading="eager" />
  <p class="label-caption no-print">${productName}${copyLabel}</p>
</div>`;
        })
        .join("\n");

      return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>طباعة ملصقات حرارية (${totalCopies} نسخة) — Ahmed Bahri</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:system-ui,-apple-system,Arial,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}

/* ── Toolbar ──────────────────────────────────────────────── */
.toolbar{
  display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;
  background:#1e293b;border-bottom:1px solid #334155;padding:14px 24px;
}
.toolbar-title{font-size:14px;font-weight:700}
.toolbar-meta{font-size:11px;color:#94a3b8;margin-top:2px}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.btn{padding:9px 20px;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn-print{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff}
.btn-close{background:#475569;color:#fff}

/* ── Preview scroll area ──────────────────────────────────── */
.labels-scroll{display:flex;flex-direction:column;align-items:center;gap:28px;padding:28px 16px}
.label-page{display:flex;flex-direction:column;align-items:center;gap:8px}
.label-img{
  width:${wMM * MM_TO_PX_96DPI}px;
  height:${hMM * MM_TO_PX_96DPI}px;
  object-fit:contain;
  border-radius:${isCircleLabel ? "50%" : "6px"};
  display:block;
  box-shadow:0 6px 32px rgba(0,0,0,.5);
  background:#fff;
}
.label-caption{font-size:11px;color:#94a3b8;text-align:center;direction:rtl;max-width:${wMM * MM_TO_PX_96DPI}px;word-break:break-word}

/* ── @media print: zero-margin thermal page ───────────────── */
@media print{
  /* @page sets the exact die-cut dimensions of the thermal roll */
  @page{size:${wMM}mm ${hMM}mm;margin:0}

  html,body{
    width:${wMM}mm!important;height:${hMM}mm!important;
    background:#fff!important;margin:0!important;padding:0!important;
    /* Force color output — required for colored label backgrounds */
    -webkit-print-color-adjust:exact!important;
    print-color-adjust:exact!important;
  }

  /* Hide all preview UI chrome */
  .toolbar,.label-caption,.no-print{display:none!important;visibility:hidden!important}

  .labels-scroll{all:unset!important;display:block!important;margin:0!important;padding:0!important}

  /* Each .label-page = one thermal label = one printer feed step */
  .label-page{
    all:unset!important;
    display:block!important;
    width:${wMM}mm!important;
    height:${hMM}mm!important;
    page-break-after:always!important;
    break-after:page!important;
    overflow:hidden!important;
  }

  /*
   * .label-img fills the thermal die-cut area edge-to-edge.
   * object-fit:fill is intentional — the rasterized PNG already has
   * the correct aspect ratio; stretching it pixel-exactly to the page
   * avoids any white bars or clipping at the edges.
   */
  .label-img{
    position:fixed!important;
    top:0!important;left:0!important;
    width:${wMM}mm!important;height:${hMM}mm!important;
    object-fit:fill!important;
    border-radius:0!important;
    box-shadow:none!important;
    visibility:visible!important;
    display:block!important;
    margin:0!important;padding:0!important;
  }
}
</style>
</head>
<body>
<div class="toolbar no-print">
  <div>
    <p class="toolbar-title">🖨 معاينة الملصقات الحرارية — Ahmed Bahri</p>
    <p class="toolbar-meta">${totalCopies} نسخة · ${wMM}×${hMM} mm · ${images.length} منتج</p>
  </div>
  <div class="actions">
    <button class="btn btn-print" onclick="window.print()">🖨 طباعة الآن</button>
    <button class="btn btn-close" onclick="window.close()">✕ إغلاق</button>
  </div>
</div>
<div class="labels-scroll">
${pages}
</div>
<script>
// Auto-trigger print after all images have decoded
window.addEventListener("load", function() {
  // 400ms delay: lets the browser print rasterizer finish rendering images
  setTimeout(function() { window.print(); }, 400);
});
// Auto-close the popup after the user dismisses the print dialog
window.addEventListener("afterprint", function() {
  setTimeout(function() { window.close(); }, 700);
});
</script>
</body>
</html>`;
    },
    [wMM, hMM, customization.labelShape]
  );

  // ── Open the print popup window ───────────────────────────────────────────
  const openPrintPopup = useCallback(
    async (images: Array<{ dataUrl: string; productName: string; quantity: number }>): Promise<void> => {
      const html = buildPrintPopupHtml(images);

      // Size and center the popup based on label dimensions
      const popupW = Math.max(560, Math.round(wMM * MM_TO_PX_96DPI + 140));
      const popupH = Math.max(520, Math.round(hMM * MM_TO_PX_96DPI + 240));
      const left   = Math.max(0, Math.round((window.screen.width  - popupW) / 2));
      const top    = Math.max(0, Math.round((window.screen.height - popupH) / 2));

      const win = window.open(
        "",
        `thermal_${Date.now()}`,
        `width=${popupW},height=${popupH},left=${left},top=${top},menubar=no,toolbar=no,scrollbars=yes,resizable=yes,status=no`
      );

      if (!win) {
        // Popup blocked — try Web Share API as fallback on mobile
        if (typeof navigator !== "undefined" && "share" in navigator && images.length === 1) {
          try {
            const blob = dataUrlToBlob(images[0].dataUrl);
            const file = new File([blob], `label_${Date.now()}.png`, { type: "image/png" });
            const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
            if (nav.canShare?.({ files: [file] })) {
              await navigator.share({ title: "طباعة ملصق حراري — Ahmed Bahri", text: images[0].productName, files: [file] });
              setStatusMsg("✅ تمت مشاركة الملصق للطباعة!");
              setTimeout(() => setStatusMsg(""), 3500);
              return;
            }
          } catch { /* user cancelled share */ }
        }

        const err = new Error("تعذّر فتح نافذة الطباعة. يُرجى السماح بالنوافذ المنبثقة في المتصفح.");
        onError?.(err);
        setStatusMsg("❌ النوافذ المنبثقة محظورة — اسمح بها في إعدادات المتصفح.");
        return;
      }

      win.document.open();
      win.document.write(html);
      win.document.close();

      setStatusMsg("✅ تم فتح نافذة الطباعة الحرارية!");
      setTimeout(() => setStatusMsg(""), 3500);
    },
    [buildPrintPopupHtml, wMM, hMM, onError]
  );

  // ── handlePrint: single-product print ────────────────────────────────────
  const handlePrint = useCallback(async (): Promise<void> => {
    setStatusMsg("جاري تجهيز ملف الطباعة الحراري...");
    try {
      const dataUrl = await rasterize();
      await openPrintPopup([{ dataUrl, productName: product.name || "label", quantity: 1 }]);
    } catch {
      setStatusMsg("❌ فشل تحويل الملصق إلى صورة.");
    }
  }, [rasterize, openPrintPopup, product.name]);

  // ── handlePrintBatch: multi-product batch print ───────────────────────────
  /**
   * Batch print flow:
   *   1. Collect items (from override arg → batchItems prop → [product × 1])
   *   2. Preview product: use fast live-DOM rasterize()
   *   3. Other products: render + rasterize off-screen
   *   4. Feed all images to openPrintPopup()
   */
  const handlePrintBatch = useCallback(
    async (overrideItems?: PrintBatchItem[]): Promise<void> => {
      const items = overrideItems ?? batchItems ?? [{ product, quantity: 1 }];
      if (items.length === 0) return;

      setIsProcessing(true);
      setStatusMsg(`جاري معالجة ${items.length} منتج للطباعة الدفعية...`);
      onRasterizeStart?.();

      const images: Array<{ dataUrl: string; productName: string; quantity: number }> = [];

      try {
        for (let i = 0; i < items.length; i++) {
          const { product: p, quantity } = items[i];
          setStatusMsg(`جاري رسترة المنتج ${i + 1} / ${items.length}: ${p.name}...`);

          let dataUrl: string;
          if (p.id === product.id && previewRef.current) {
            // Fast path: the preview DOM node is already rendered
            dataUrl = await rasterize();
          } else {
            // Slow path: render + rasterize off-screen
            dataUrl = await rasterizeProduct(p, customization);
          }

          onRasterizeComplete?.(dataUrl);
          images.push({ dataUrl, productName: p.name || "label", quantity });
        }

        await openPrintPopup(images);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        setStatusMsg("❌ فشل تجهيز مهمة الطباعة الدفعية.");
      } finally {
        setIsProcessing(false);
      }
    },
    [batchItems, product, rasterize, rasterizeProduct, customization, openPrintPopup, onRasterizeStart, onRasterizeComplete, onError]
  );

  // ── handleDownloadPNG ─────────────────────────────────────────────────────
  const handleDownloadPNG = useCallback(async (): Promise<void> => {
    setStatusMsg("جاري استخراج صورة PNG 4× الدقة...");
    try {
      const dataUrl  = await rasterize();
      const safeName = (product.name || "label").replace(/\s+/g, "_").replace(/[^\w\u0600-\u06FF-]/g, "");
      const a = document.createElement("a");
      a.href     = dataUrl;
      a.download = `label_${safeName}_${wMM}x${hMM}mm_4x.png`;
      a.click();
      setStatusMsg("✅ تم تحميل PNG بنجاح!");
      setTimeout(() => setStatusMsg(""), 3500);
    } catch {
      setStatusMsg("❌ فشل تحميل الصورة.");
    }
  }, [rasterize, product.name, wMM, hMM]);

  // ── Expose imperative handle ──────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({ print: handlePrint, downloadPNG: handleDownloadPNG, rasterize, printBatch: handlePrintBatch }),
    [handlePrint, handleDownloadPNG, rasterize, handlePrintBatch]
  );

  const isError   = statusMsg.startsWith("❌");
  const isSuccess = statusMsg.startsWith("✅");

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── Live DOM Preview (the node html-to-image captures) ─────────────── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, color: "#a78bfa", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          🔍 معاينة DOM مباشرة — {wMM}×{hMM} mm
        </span>

        {/*
          ▼ html-to-image targets this exact div via previewRef.
            inline-block wrapper ensures the capture area matches the label
            dimensions precisely with zero extra whitespace.
        */}
        <div ref={previewRef} style={{ display: "inline-block", lineHeight: 0 }}>
          <LabelPreviewDOM
            product={product}
            customization={customization}
            barcodeUrl={barcodeUrl}
            qrUrl={qrUrl}
            safeLogoUrl={safeLogoUrl}
            scale={previewScale}
          />
        </div>

        {/* Technical metadata badge */}
        <span style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace" }}>
          {wMM}mm × {hMM}mm · {RASTER_PIXEL_RATIO}× pixelRatio ·{" "}
          {Math.round(wMM * MM_TO_PX_96DPI * RASTER_PIXEL_RATIO)}×
          {Math.round(hMM * MM_TO_PX_96DPI * RASTER_PIXEL_RATIO)}px PNG output
        </span>
      </div>

      {/* ── Status Badge ──────────────────────────────────────────────────── */}
      {statusMsg && (
        <div
          role="status"
          aria-live="polite"
          style={{
            textAlign: "center",
            fontSize: "12px",
            fontWeight: 600,
            color:      isError ? "#f87171" : isSuccess ? "#34d399" : "#93c5fd",
            padding:    "7px 14px",
            borderRadius: "10px",
            background: isError ? "rgba(239,68,68,.1)" : isSuccess ? "rgba(52,211,153,.1)" : "rgba(147,197,253,.08)",
            border: `1px solid ${isError ? "rgba(239,68,68,.3)" : isSuccess ? "rgba(52,211,153,.3)" : "rgba(147,197,253,.2)"}`,
            direction: "rtl",
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* ── Action Buttons ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

        {/* PRIMARY — Raster DOM Print (single preview product) */}
        <button
          id="thermal-raster-print-btn"
          type="button"
          disabled={isProcessing}
          onClick={handlePrint}
          style={{
            width: "100%", padding: "12px 16px", borderRadius: "12px", border: "none",
            background: isProcessing ? "#4c1d95" : "linear-gradient(135deg,#7c3aed,#4f46e5)",
            color: "#fff", fontWeight: 800, fontSize: "14px",
            cursor: isProcessing ? "not-allowed" : "pointer",
            opacity: isProcessing ? 0.6 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            boxShadow: "0 4px 14px rgba(124,58,237,.4)",
            transition: "opacity .2s", direction: "rtl",
          }}
        >
          <span style={{ fontSize: "18px" }}>🖨</span>
          <span>{isProcessing ? "جاري المعالجة..." : "طباعة حرارية (DOM Raster 4×)"}</span>
        </button>

        {/* SECONDARY — Batch print (visible only when batchItems are provided) */}
        {batchItems && batchItems.length > 0 && (
          <button
            id="thermal-batch-print-btn"
            type="button"
            disabled={isProcessing}
            onClick={() => handlePrintBatch()}
            style={{
              width: "100%", padding: "11px 16px", borderRadius: "12px",
              border: "1px solid rgba(52,211,153,.35)", background: "rgba(52,211,153,.1)",
              color: "#34d399", fontWeight: 700, fontSize: "13px",
              cursor: isProcessing ? "not-allowed" : "pointer",
              opacity: isProcessing ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              transition: "opacity .2s", direction: "rtl",
            }}
          >
            <span>📦</span>
            <span>
              طباعة دفعية ({batchItems.length} منتج ·{" "}
              {batchItems.reduce((s, i) => s + i.quantity, 0)} نسخة)
            </span>
          </button>
        )}

        {/* TERTIARY — Download 4× PNG */}
        <button
          id="thermal-raster-png-btn"
          type="button"
          disabled={isProcessing}
          onClick={handleDownloadPNG}
          style={{
            width: "100%", padding: "10px 16px", borderRadius: "12px",
            border: "1px solid rgba(124,58,237,.35)", background: "rgba(124,58,237,.08)",
            color: "#c4b5fd", fontWeight: 700, fontSize: "13px",
            cursor: isProcessing ? "not-allowed" : "pointer",
            opacity: isProcessing ? 0.5 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            transition: "opacity .2s", direction: "rtl",
          }}
        >
          <span>🖼</span>
          <span>تحميل PNG عالي الدقة (4×)</span>
        </button>
      </div>
    </div>
  );
});

ThermalLabelPrinter.displayName = "ThermalLabelPrinter";

export default ThermalLabelPrinter;
