/**
 * printer-service.ts
 *
 * Enterprise-grade Batch Label Printing & Printer Integration Service.
 * Decoupled from UI components.
 * Supports:
 *  - 1D Barcode, 2D QR Code, or Both rendering per label
 *  - Per-item quantity allocation
 *  - Direct Browser & Native Thermal Label printing window
 *  - Downloadable Printable HTML/PDF Document export
 */

import QRCode from "qrcode";
import type { Product } from "./types";

export type CodePrintType = "barcode" | "qr" | "both";
export type PrintQuantityMode = "unified" | "custom";

export interface PrintItemConfig {
  product: Product;
  quantity: number;
}

export interface PrintJobOptions {
  codeType: CodePrintType;
  items: PrintItemConfig[];
  storeName?: string;
  showPrice?: boolean;
}

/**
 * Generate Base64 Data URL for a QR Code string safely.
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
    console.error("[PrinterService] Failed to generate QR Data URL:", err);
  }
  return "";
}

/**
 * Generates an optimized, self-contained printable HTML document string
 * formatted for thermal label printers or standard A4/A6 label sheets.
 */
export async function buildPrintableDocument(options: PrintJobOptions): Promise<string> {
  const { codeType, items, storeName = "معرض أحمد بحري", showPrice = true } = options;

  // Pre-generate QR Data URLs for all items that require QR printing
  const qrMap = new Map<string, string>();
  if (codeType === "qr" || codeType === "both") {
    for (const item of items) {
      if (item.product.qrCode && !qrMap.has(item.product.id)) {
        const url = await generateQRDataURL(item.product.qrCode);
        qrMap.set(item.product.id, url);
      }
    }
  }

  // Build labels array repeating per item quantity
  const labelsHTML: string[] = [];

  for (const { product, quantity } of items) {
    const qty = Math.max(1, quantity);
    const barcodeVal = product.barcode || "";
    const qrDataUrl = qrMap.get(product.id) || "";

    for (let i = 0; i < qty; i++) {
      labelsHTML.push(`
        <div class="label-card">
          <div class="store-name">${storeName}</div>
          <div class="product-name">${product.name}</div>
          
          ${
            showPrice
              ? `<div class="product-price">${product.retailPrice.toLocaleString()} د.ع</div>`
              : ""
          }

          <div class="codes-container">
            ${
              (codeType === "barcode" || codeType === "both") && barcodeVal
                ? `<div class="barcode-wrapper">
                    <img src="https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(barcodeVal)}&code=Code128&dpi=96&unit=Min&width=1.5&height=40" alt="Barcode" class="barcode-img" />
                    <div class="code-text">${barcodeVal}</div>
                   </div>`
                : ""
            }

            ${
              (codeType === "qr" || codeType === "both") && qrDataUrl
                ? `<div class="qr-wrapper">
                    <img src="${qrDataUrl}" alt="QR" class="qr-img" />
                    ${!barcodeVal || codeType === "qr" ? `<div class="code-text">${product.qrCode || ""}</div>` : ""}
                   </div>`
                : ""
            }
          </div>
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
          body { background: #fff; padding: 0; }
          .no-print { display: none !important; }
          .labels-grid { gap: 8px !important; }
          .label-card { break-inside: avoid; page-break-inside: avoid; }
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
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
          flex-col;
          align-items: center;
          justify-content: space-between;
          min-height: 180px;
        }
        .store-name {
          font-size: 10px;
          color: #64748b;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .product-name {
          font-size: 13px;
          font-weight: 800;
          color: #0f172a;
          margin: 4px 0;
          line-clamp: 2;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .product-price {
          font-size: 14px;
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
          margin-top: auto;
        }
        .barcode-wrapper, .qr-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }
        .barcode-img {
          max-height: 42px;
          max-width: 100%;
          object-contain: contain;
        }
        .qr-img {
          width: 64px;
          height: 64px;
          object-fit: contain;
        }
        .code-text {
          font-family: monospace;
          font-size: 10px;
          color: #475569;
          margin-top: 2px;
          letter-spacing: 1px;
        }
      </style>
    </head>
    <body>
      <div class="header-bar no-print">
        <div>
          <h2 style="font-size:18px;">معاينة ملصقات الباركود والـ QR</h2>
          <p style="font-size:12px; color:#64748b;">إجمالي الملصقات: <strong>${labelsHTML.length}</strong> ملصق</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn-print" onclick="window.print()">🖨 أمر الطباعة</button>
          <button class="btn-print" style="background:#64748b;" onclick="window.close()">إلغاء</button>
        </div>
      </div>

      <div class="labels-grid">
        ${labelsHTML.join("\n")}
      </div>

      <script>
        // Auto print prompt when loaded in popup window
        if (window.opener) {
          window.onload = () => {
            setTimeout(() => { window.print(); }, 500);
          };
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Directly triggers browser / thermal printer window for a Print Job.
 */
export async function executePrintJob(options: PrintJobOptions): Promise<void> {
  const html = await buildPrintableDocument(options);
  const printWin = window.open("", "_blank", "width=800,height=600");
  if (!printWin) {
    throw new Error("تعذّر فتح نافذة الطباعة. يُرجى السماح بالنوافذ المنبثقة (Popups).");
  }
  printWin.document.write(html);
  printWin.document.close();
}

/**
 * Downloads a self-contained printable HTML/PDF label sheet file.
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
