"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import Barcode from "react-barcode";

export interface BarcodeDisplayProps {
  barcode?: string | null;
  qrCode?: string | null;
  productName?: string;
  compact?: boolean;
  showPrint?: boolean;
}

export const BarcodeDisplay: React.FC<BarcodeDisplayProps> = ({
  barcode,
  qrCode,
  productName,
  compact = false,
  showPrint = false,
}) => {
  const [mounted, setMounted] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [qrError, setQrError] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let active = true;

    const generateQR = async () => {
      const codeStr = qrCode?.trim();
      if (!codeStr) {
        setQrDataUrl(null);
        setQrError(false);
        setQrLoading(false);
        return;
      }

      setQrLoading(true);
      setQrError(false);

      try {
        // Universal method resolver for module imports (handles ESM, CJS, and Turbopack bundler variations)
        const toDataURLFn =
          typeof QRCode?.toDataURL === "function"
            ? QRCode.toDataURL
            : (QRCode as unknown as { default: { toDataURL: typeof QRCode.toDataURL } })?.default?.toDataURL;

        if (typeof toDataURLFn === "function") {
          const url = await toDataURLFn(codeStr, {
            width: 200,
            margin: 1,
            color: { dark: "#000000", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          if (active) {
            setQrDataUrl(url);
            setQrLoading(false);
          }
        } else {
          throw new Error("QRCode.toDataURL method is unavailable");
        }
      } catch (err) {
        console.error("[BarcodeDisplay] Failed to generate QR Code Data URL:", err);
        if (active) {
          setQrDataUrl(null);
          setQrError(true);
          setQrLoading(false);
        }
      }
    };

    generateQR();

    return () => {
      active = false;
    };
  }, [qrCode]);

  // Don't render until client-side hydration completes
  if (!mounted) return null;

  const hasBarcode = Boolean(barcode && barcode.trim());
  const hasQrCode = Boolean(qrCode && qrCode.trim());

  if (!hasBarcode && !hasQrCode) return null;

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=450,height=350");
    if (!win) return;
    const html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>طباعة الباركود — ${productName || "منتج"}</title>
        <style>
          body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; background: #fff; }
          .label { text-align: center; padding: 20px; border: 2px dashed #000; border-radius: 12px; max-width: 320px; width: 100%; box-sizing: border-box; }
          .product-name { font-size: 15px; font-weight: bold; margin-bottom: 12px; color: #111; word-break: break-word; }
          .code-text { font-family: monospace; font-size: 12px; letter-spacing: 2px; color: #333; margin-top: 6px; }
          img { max-width: 160px; display: block; margin: 8px auto; }
        </style>
      </head>
      <body>
        <div class="label">
          ${productName ? `<div class="product-name">${productName}</div>` : ""}
          ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code" />` : ""}
          ${barcode ? `<div class="code-text">${barcode}</div>` : ""}
        </div>
        <script>window.onload = () => { window.print(); window.close(); }</script>
      </body>
      </html>
    `;
    win.document.write(html);
    win.document.close();
  };

  return (
    <div
      className={`flex ${
        compact
          ? "flex-row gap-3 items-center"
          : "flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 gap-4"
      }`}
    >
      {/* 1D Barcode Renderer */}
      {hasBarcode && (
        <div className="bg-white p-2.5 rounded-xl overflow-hidden shadow-xs border border-gray-200 flex flex-col items-center justify-center max-w-full">
          <Barcode
            value={barcode!.trim()}
            format="CODE128"
            width={1.4}
            height={42}
            fontSize={12}
            margin={2}
            background="#ffffff"
            lineColor="#000000"
          />
        </div>
      )}

      {/* 2D QR Code Renderer */}
      {hasQrCode && (
        <div className="flex flex-col items-center gap-1.5">
          {qrLoading && (
            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center animate-pulse border border-gray-200 dark:border-gray-600">
              <span className="text-xs text-gray-400">جاري الرسم...</span>
            </div>
          )}

          {!qrLoading && qrDataUrl && (
            <div className="bg-white p-1.5 rounded-xl border border-gray-200 shadow-xs flex flex-col items-center">
              <img
                src={qrDataUrl}
                alt={productName || "QR Code"}
                className="w-24 h-24 object-contain rounded-lg block"
                loading="eager"
              />
            </div>
          )}

          {!qrLoading && qrError && (
            <div className="w-24 h-24 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800 flex items-center justify-center text-center p-1">
              <span className="text-[10px] text-red-500 font-bold">تعذّر رسم الرمز</span>
            </div>
          )}

          <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono tracking-wider max-w-[140px] truncate select-all">
            {qrCode}
          </span>
        </div>
      )}

      {/* Print Action */}
      {showPrint && (hasBarcode || hasQrCode) && (
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-bold transition-colors mt-1"
        >
          <span>🖨</span>
          <span>طباعة الملصق</span>
        </button>
      )}
    </div>
  );
};

export default BarcodeDisplay;