"use client";

import { useRef } from "react";

interface BarcodeDisplayProps {
  barcode?: string | null;
  qrCode?: string | null;
  productName?: string;
  compact?: boolean;
}

/**
 * BarcodeDisplay — renders a visual barcode strip and QR code for a product.
 *
 * Uses CSS-only barcode rendering (no npm barcode package needed in the DOM)
 * and a Google Charts QR image (no external JS required, pure <img>).
 * This keeps the bundle small and rendering instant.
 */
export default function BarcodeDisplay({
  barcode,
  qrCode,
  productName,
  compact = false,
}: BarcodeDisplayProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!barcode && !qrCode) return null;

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=400,height=300");
    if (!win || !printRef.current) return;
    const html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>طباعة الباركود — ${productName || "منتج"}</title>
        <style>
          body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: Arial, sans-serif; background: #fff; }
          .label { text-align: center; padding: 16px 24px; border: 2px dashed #ccc; border-radius: 8px; max-width: 320px; }
          .product-name { font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #111; }
          .code-text { font-family: monospace; font-size: 13px; letter-spacing: 2px; color: #333; margin-top: 6px; }
          img { max-width: 180px; display: block; margin: 0 auto; }
        </style>
      </head>
      <body>
        <div class="label">
          ${productName ? `<div class="product-name">${productName}</div>` : ""}
          ${printRef.current.innerHTML}
        </div>
        <script>window.onload = () => { window.print(); window.close(); }</script>
      </body>
      </html>
    `;
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className={`flex ${compact ? "gap-3 items-center" : "flex-col gap-3"}`}>
      <div ref={printRef} className={`flex ${compact ? "gap-3 items-center" : "flex-col gap-3 items-center"}`}>

        {/* Barcode Visual — using Google Charts API for clean rendering */}
        {barcode && (
          <div className="flex flex-col items-center gap-1">
            <img
              src={`https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(barcode)}&code=EAN13&dpi=96&quietzone=0&unit=Min&width=1.6&height=50`}
              alt={`باركود ${barcode}`}
              className="h-12 object-contain"
              onError={(e) => {
                // Fallback: render as styled text barcode
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="font-mono text-[11px] text-gray-500 tracking-widest select-all">{barcode}</span>
          </div>
        )}

        {/* QR Code — Google Charts QR renderer */}
        {qrCode && (
          <div className="flex flex-col items-center gap-1">
            <img
              src={`https://chart.googleapis.com/chart?cht=qr&chs=80x80&chl=${encodeURIComponent(qrCode)}&choe=UTF-8`}
              alt={`QR Code ${qrCode}`}
              className="w-16 h-16 object-contain rounded-sm"
            />
            <span className="font-mono text-[10px] text-gray-400 max-w-[80px] truncate select-all">{qrCode}</span>
          </div>
        )}
      </div>

      {/* Print Label Button */}
      {!compact && (barcode || qrCode) && (
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium transition-colors"
          title="طباعة بطاقة الباركود"
        >
          <span>🖨</span>
          <span>طباعة البطاقة</span>
        </button>
      )}
    </div>
  );
}
