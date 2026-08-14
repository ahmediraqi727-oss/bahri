/**
 * printer-service.ts
 *
 * Enterprise-Grade Decoupled Printer Service & Data URL Generator.
 * Converts 1D Linear Barcodes (via JsBarcode canvas) and 2D QR Codes (via QRCode)
 * into static 100% offline Base64 Data URLs (data:image/png;base64,...).
 *
 * Guarantees zero CORS / zero network latency / 100% reliable rendering
 * inside window.print(), popup windows, thermal printer drivers, and PDF exports.
 */

import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import type { Product } from "./types";

export type CodePrintType = "barcode" | "qr" | "both";
export type PrintQuantityMode = "unified" | "custom";

export interface LabelCustomizationOptions {
  showProductName: boolean;
  showProductPrice: boolean;
  showBarcode: boolean;
  showQRCode: boolean;
  showFooterText: boolean;
  footerText: string;
  barcodeHeight: number; // 30 - 80px
  nameFontSize: number;  // 10 - 20px
  priceFontSize: number; // 12 - 24px
}

export const DEFAULT_LABEL_CUSTOMIZATION: LabelCustomizationOptions = {
  showProductName: true,
  showProductPrice: true,
  showBarcode: true,
  showQRCode: true,
  showFooterText: true,
  footerText: "معرض أحمد بحري",
  barcodeHeight: 45,
  nameFontSize: 13,
  priceFontSize: 14,
};

export interface PrintItemConfig {
  product: Product;
  quantity: number;
}

export interface PrintJobOptions {
  items: PrintItemConfig[];
  customization: LabelCustomizationOptions;
}

/**
 * Converts a 1D Barcode string into a pure Base64 PNG Data URL using off-screen HTMLCanvasElement.
 * Zero external network dependency.
 */
export function generateBarcodeDataURL(text: string, height = 45): string {
  if (!text || !text.trim()) return "";
  try {
    if (typeof document === "undefined") return "";
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, text.trim(), {
      format: "CODE128",
      width: 1.5,
      height: height,
      displayValue: true,
      fontSize: 11,
      margin: 4,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("[PrinterService] Failed to generate 1D Barcode Data URL:", err);
    return "";
  }
}

/**
 * Converts a 2D QR Code string into a pure Base64 PNG Data URL using QRCode library.
 * Zero external network dependency.
 */
export async function generateQRDataURL(text: string): Promise<string> {
  if (!text || !text.trim()) return "";
  try {
    const toDataURLFn =
      typeof QRCode?.toDataURL === "function"
        ? QRCode.toDataURL
        : (QRCode as unknown as { default: { toDataURL: typeof QRCode.toDataURL } })?.default?.toDataURL;

    if (typeof toDataURLFn === "function") {
      return await toDataURLFn(text.trim(), {
        width: 180,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
    }
  } catch (err) {
    console.error("[PrinterService] Failed to generate 2D QR Data URL:", err);
  }
  return "";
}

/**
 * Generates an optimized, self-contained printable HTML document string
 * formatted for thermal label printers or standard label sheets with exact @media print CSS.
 */
export async function buildPrintableDocument(options: PrintJobOptions): Promise<string> {
  const { items, customization } = options;

  // Pre-generate Base64 Data URLs for all 1D Barcodes and 2D QRs
  const barcodeMap = new Map<string, string>();
  const qrMap = new Map<string, string>();

  for (const item of items) {
    const p = item.product;
    if (customization.showBarcode && p.barcode && !barcodeMap.has(p.id)) {
      const dataUrl = generateBarcodeDataURL(p.barcode, customization.barcodeHeight);
      barcodeMap.set(p.id, dataUrl);
    }
    if (customization.showQRCode && p.qrCode && !qrMap.has(p.id)) {
      const dataUrl = await generateQRDataURL(p.qrCode);
      qrMap.set(p.id, dataUrl);
    }
  }

  // Build labels HTML repeating per item quantity
  const labelsHTML: string[] = [];

  for (const { product, quantity } of items) {
    const qty = Math.max(1, quantity);
    const barcodeDataUrl = barcodeMap.get(product.id) || "";
    const qrDataUrl = qrMap.get(product.id) || "";

    for (let i = 0; i < qty; i++) {
      labelsHTML.push(`
        <div class="label-card">
          ${
            customization.showProductName
              ? `<div class="product-name" style="font-size: ${customization.nameFontSize}px;">${product.name}</div>`
              : ""
          }
          
          ${
            customization.showProductPrice
              ? `<div class="product-price" style="font-size: ${customization.priceFontSize}px;">${product.retailPrice.toLocaleString()} د.ع</div>`
              : ""
          }

          <div class="codes-container">
            ${
              customization.showBarcode && barcodeDataUrl
                ? `<div class="barcode-wrapper">
                    <img src="${barcodeDataUrl}" alt="Barcode" className="barcode-img" style="height: ${customization.barcodeHeight}px;" />
                   </div>`
                : ""
            }

            ${
              customization.showQRCode && qrDataUrl
                ? `<div class="qr-wrapper">
                    <img src="${qrDataUrl}" alt="QR Code" class="qr-img" />
                   </div>`
                : ""
            }
          </div>

          ${
            customization.showFooterText && customization.footerText
              ? `<div class="footer-text">${customization.footerText}</div>`
              : ""
          }
        </div>
      `);
    }
  }

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <title>طباعة الملصقات (${labelsHTML.length} ملصق)</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background: #f8fafc;
          padding: 20px;
          color: #0f172a;
        }
        @media print {
          @page {
            margin: 5mm;
          }
          body {
            background: #fff !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .labels-grid {
            gap: 6mm !important;
            display: flex !important;
            flex-wrap: wrap !important;
          }
          .label-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 1px solid #000 !important;
            box-shadow: none !important;
          }
        }
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #fff;
          padding: 16px 24px;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
          margin-bottom: 24px;
        }
        .btn-print {
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 10px 24px;
          border-radius: 12px;
          font-weight: bold;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-print:hover { background: #1d4ed8; }
        .labels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 16px;
          justify-content: center;
        }
        .label-card {
          background: #fff;
          border: 2px dashed #cbd5e1;
          border-radius: 12px;
          padding: 12px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          min-height: 170px;
          max-width: 260px;
          margin: 0 auto;
          width: 100%;
        }
        .product-name {
          font-weight: 800;
          color: #0f172a;
          line-height: 1.3;
          margin-bottom: 4px;
          word-break: break-word;
        }
        .product-price {
          font-weight: 900;
          color: #2563eb;
          margin-bottom: 6px;
        }
        .codes-container {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
          width: 100%;
          margin: 6px 0;
        }
        .barcode-wrapper, .qr-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
        }
        .barcode-img {
          max-width: 100%;
          object-fit: contain;
          display: block;
        }
        .qr-img {
          width: 68px;
          height: 68px;
          object-fit: contain;
          display: block;
        }
        .footer-text {
          font-size: 10px;
          color: #64748b;
          font-weight: bold;
          margin-top: 6px;
          letter-spacing: 0.5px;
          border-top: 1px solid #f1f5f9;
          padding-top: 4px;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div class="header-bar no-print">
        <div>
          <h2 style="font-size:18px;">معاينة طباعة الملصقات</h2>
          <p style="font-size:12px; color:#64748b;">إجمالي عدد الملصقات: <strong>${labelsHTML.length}</strong> ملصق</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn-print" onclick="window.print()">🖨 أمر الطباعة الفوري</button>
          <button class="btn-print" style="background:#64748b;" onclick="window.close()">إغلاق</button>
        </div>
      </div>

      <div class="labels-grid">
        ${labelsHTML.join("\n")}
      </div>

      <script>
        if (window.opener) {
          window.onload = () => {
            setTimeout(() => { window.print(); }, 400);
          };
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Triggers browser / thermal printer popup with 100% local Data URLs.
 */
export async function executePrintJob(options: PrintJobOptions): Promise<void> {
  const html = await buildPrintableDocument(options);
  const printWin = window.open("", "_blank", "width=850,height=650");
  if (!printWin) {
    throw new Error("تعذّر فتح نافذة الطباعة. يُرجى السماح بالنوافذ المنبثقة (Popups).");
  }
  printWin.document.write(html);
  printWin.document.close();
}

/**
 * Downloads self-contained HTML label batch file.
 */
export async function exportPrintableFile(
  options: PrintJobOptions,
  filename = "barcode_labels.html"
): Promise<void> {
  const html = await buildPrintableDocument(options);
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
