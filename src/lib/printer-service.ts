/**
 * printer-service.ts
 *
 * Enterprise Decoupled Printer Service & Hardware Bridge.
 * Combines 1D/2D base64 barcode generators with the Marklife X4 & TSPL/ZPL Thermal Engine.
 */

import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import type { Product } from "./types";
import {
  ExtendedLabelCustomization,
  DEFAULT_EXTENDED_CUSTOMIZATION,
  GLOBAL_THERMAL_PRESETS,
  MARKLIFE_X4_PRESETS,
  DEFAULT_LABEL_ELEMENT_ORDER,
  moveElementOrder,
  generateTSPLCommands,
  generateZPLCommands,
  connectWebBluetoothPrinter,
  sendTSPLToBluetooth,
  connectWebUSBPrinter,
  sendTSPLToUSB,
  handshakeWithMarklifeApp,
  exportLabelsAsPDF,
  renderLabelToImageBlob,
  resolveQRPayload,
  ThermalPrintJobItem,
  BarcodeSymbology,
  LabelShape,
  QRErrorCorrection,
  QRTargetMode,
  LabelElementId,
} from "./thermal-printer-engine";

export type CodePrintType = "barcode" | "qr" | "both";
export type PrintQuantityMode = "unified" | "custom";

export interface LabelCustomizationOptions extends ExtendedLabelCustomization {}

export const DEFAULT_LABEL_CUSTOMIZATION: LabelCustomizationOptions = {
  ...DEFAULT_EXTENDED_CUSTOMIZATION,
};

export interface PrintItemConfig {
  product: Product;
  quantity: number;
  serialNumber?: string;
}

export interface PrintJobOptions {
  items: PrintItemConfig[];
  customization: LabelCustomizationOptions;
}

// Re-export thermal engine capabilities
export {
  GLOBAL_THERMAL_PRESETS,
  MARKLIFE_X4_PRESETS,
  DEFAULT_LABEL_ELEMENT_ORDER,
  moveElementOrder,
  generateTSPLCommands,
  generateZPLCommands,
  connectWebBluetoothPrinter,
  sendTSPLToBluetooth,
  connectWebUSBPrinter,
  sendTSPLToUSB,
  handshakeWithMarklifeApp,
  exportLabelsAsPDF,
  renderLabelToImageBlob,
  resolveQRPayload,
};
export type { BarcodeSymbology, LabelShape, QRErrorCorrection, QRTargetMode, LabelElementId };

/**
 * Converts a 1D Barcode string into a pure Base64 PNG Data URL using off-screen HTMLCanvasElement.
 */
export function generateBarcodeDataURL(
  text: string,
  height = 45,
  format: BarcodeSymbology = "CODE128"
): string {
  if (!text || !text.trim()) return "";
  try {
    if (typeof document === "undefined") return "";
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, text.trim(), {
      format: format || "CODE128",
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
 */
export async function generateQRDataURL(
  text: string,
  ecc: QRErrorCorrection = "M"
): Promise<string> {
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
        errorCorrectionLevel: ecc,
      });
    }
  } catch (err) {
    console.error("[PrinterService] Failed to generate 2D QR Data URL:", err);
  }
  return "";
}

/**
 * Generates an optimized, self-contained printable HTML document string formatted for thermal label printers.
 * Enforces Circular Safe-Area layout, Element Reordering, and Strict Conditional Visibility.
 */
export async function buildPrintableDocument(options: PrintJobOptions): Promise<string> {
  const { items, customization } = options;

  const barcodeMap = new Map<string, string>();
  const qrMap = new Map<string, string>();

  const widthMM = customization.labelShape === "square" || customization.labelShape === "circle"
    ? customization.rollWidthMM
    : customization.rollWidthMM;
  const heightMM = customization.labelShape === "square" || customization.labelShape === "circle"
    ? customization.rollWidthMM
    : customization.rollHeightMM;

  const elementOrder = customization.elementOrder && customization.elementOrder.length > 0
    ? customization.elementOrder
    : DEFAULT_LABEL_ELEMENT_ORDER;

  for (const item of items) {
    const p = item.product;
    // STRICT CONDITIONAL BINDING
    if (customization.showBarcode && p.barcode && !barcodeMap.has(p.id)) {
      const dataUrl = generateBarcodeDataURL(
        p.barcode,
        customization.barcodeHeight,
        customization.barcodeType || "CODE128"
      );
      barcodeMap.set(p.id, dataUrl);
    }

    const qrPayload = resolveQRPayload(p, customization);
    // STRICT CONDITIONAL BINDING
    if ((customization.showQRCode || customization.showStoreURLQR) && qrPayload && !qrMap.has(p.id)) {
      const dataUrl = await generateQRDataURL(qrPayload, customization.qrErrorCorrection || "M");
      qrMap.set(p.id, dataUrl);
    }
  }

  const labelsHTML: string[] = [];

  for (const { product, quantity } of items) {
    const qty = Math.max(1, quantity);
    const barcodeDataUrl = barcodeMap.get(product.id) || "";
    const qrDataUrl = qrMap.get(product.id) || "";

    const isCircle = customization.labelShape === "circle";
    const shapeStyle = isCircle ? "border-radius: 50%; padding: 14% 10%;" : "padding: 8px;";

    for (let i = 0; i < qty; i++) {
      const elementBlocks: string[] = [];

      for (const elemId of elementOrder) {
        if (elemId === "name" && customization.showProductName && product.name) {
          elementBlocks.push(
            `<div class="product-name" style="font-size: ${customization.nameFontSize}px;">${product.name}</div>`
          );
        } else if (elemId === "price" && customization.showProductPrice && product.retailPrice) {
          elementBlocks.push(
            `<div class="product-price" style="font-size: ${customization.priceFontSize}px;">${product.retailPrice.toLocaleString()} IQD</div>`
          );
        } else if (elemId === "codes") {
          const codeParts: string[] = [];
          if (customization.showBarcode && barcodeDataUrl) {
            codeParts.push(
              `<div class="barcode-wrapper">
                <img src="${barcodeDataUrl}" alt="Barcode" class="barcode-img" style="height: ${customization.barcodeHeight}px;" />
               </div>`
            );
          }
          if ((customization.showQRCode || customization.showStoreURLQR) && qrDataUrl) {
            codeParts.push(
              `<div class="qr-wrapper">
                <img src="${qrDataUrl}" alt="QR Code" class="qr-img" style="width: ${customization.qrSizePx || 56}px; height: ${customization.qrSizePx || 56}px;" />
               </div>`
            );
          }
          if (codeParts.length > 0) {
            elementBlocks.push(`<div class="codes-container">${codeParts.join("\n")}</div>`);
          }
        } else if (elemId === "footer" && customization.showFooterText && customization.footerText) {
          elementBlocks.push(`<div class="footer-text">${customization.footerText}</div>`);
        }
      }

      labelsHTML.push(`
        <div class="label-card" style="width: ${widthMM}mm; min-height: ${heightMM}mm; ${shapeStyle}">
          ${elementBlocks.join("\n")}
        </div>
      `);
    }
  }

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <title>طباعة الملصقات الحرارية (${labelsHTML.length} ملصق)</title>
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
            size: ${widthMM}mm ${heightMM}mm;
            margin: 0;
          }
          body {
            background: #fff !important;
            padding: 0 !important;
          }
          .no-print { display: none !important; }
          .labels-grid { gap: 0 !important; display: block !important; }
          .label-card {
            break-after: page !important;
            page-break-after: always !important;
            border: none !important;
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
        }
        .labels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(${widthMM}mm, 1fr));
          gap: 16px;
          justify-content: center;
        }
        .label-card {
          background: #fff;
          border: 1px dashed #cbd5e1;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          margin: 0 auto;
          overflow: hidden;
        }
        .product-name {
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
          word-break: break-word;
          max-width: 100%;
        }
        .product-price {
          font-weight: 900;
          color: #2563eb;
        }
        .codes-container {
          display: flex;
          gap: 6px;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 100%;
        }
        .barcode-wrapper, .qr-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          max-width: 100%;
        }
        .barcode-img { max-width: 100%; object-fit: contain; }
        .qr-img { object-fit: contain; }
        .footer-text {
          font-size: 9px;
          color: #64748b;
          font-weight: bold;
          border-top: 1px solid #f1f5f9;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div class="header-bar no-print">
        <div>
          <h2 style="font-size:18px;">معاينة استوديو الملصقات الحرارية</h2>
          <p style="font-size:12px; color:#64748b;">إجمالي عدد الملصقات: <strong>${labelsHTML.length}</strong> ملصق (${widthMM}×${heightMM} mm)</p>
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
  filename = "thermal_barcode_labels.html"
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
