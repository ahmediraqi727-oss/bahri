/**
 * thermal-printer-engine.ts
 *
 * Enterprise Thermal Label Printing & Hardware Subsystem for Ahmed Bahri Store.
 * Supports Multi-Shape Label Rolls (Rectangle, Square, Circle with Circular Safe-Area),
 * Global Standard Presets, Expanded Colors Suite, Site Logo Integration & Watermarking,
 * Strict Conditional Visibility, Dynamic Element Reordering Engine,
 * Dual 1D/2D QR Barcode Engine, and Dynamic Store URL QR Encoding.
 */

import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import type { Product } from "./types";

export type BarcodeSymbology = "CODE128" | "EAN13" | "EAN8" | "CODE39" | "UPC";
export type ThermalProtocol = "TSPL" | "ZPL" | "ESCPOS";
export type LabelShape = "rectangle" | "square" | "circle";
export type QRErrorCorrection = "L" | "M" | "Q" | "H";
export type QRTargetMode = "product_qr" | "store_url" | "product_url";
export type LabelElementId = "name" | "price" | "codes" | "footer";
export type LogoPlacement = "top_center" | "top_left" | "top_right" | "background_watermark";

export interface LabelRollDimensions {
  widthMM: number;
  heightMM: number;
  gapMM: number;
}

export interface ThermalHardwareConfig {
  density: number; // 1 to 15 (Marklife X4 burn time)
  speed: number;   // 1 to 5 (Print speed IPS)
  retractMM: number; // Media retraction gap
  protocol: ThermalProtocol;
}

export interface ExtendedLabelCustomization {
  rollWidthMM: number;
  rollHeightMM: number;
  gapMM: number;
  density: number;
  speed: number;
  barcodeType: BarcodeSymbology;
  showProductName: boolean;
  showProductPrice: boolean;
  showBarcode: boolean;
  showQRCode: boolean;
  showStoreURLQR: boolean;
  qrTargetMode: QRTargetMode;
  qrErrorCorrection: QRErrorCorrection;
  qrSizePx: number;
  labelShape: LabelShape;
  showFooterText: boolean;
  footerText: string;
  barcodeHeight: number; // in px
  nameFontSize: number;  // in px
  priceFontSize: number; // in px
  enableSerialNumbers: boolean;
  serialStartNumber: number;
  presetName: string;
  storeUrl: string;
  elementOrder: LabelElementId[];
  // Color Customization Suite
  labelBgColor: string;
  textColor: string;
  borderColor: string;
  // Site Logo Integration & Watermark Engine
  showLogo: boolean;
  logoUrl: string;
  logoPosition: LogoPlacement;
  logoSizePx: number;
}

export const DEFAULT_LABEL_ELEMENT_ORDER: LabelElementId[] = ["name", "price", "codes", "footer"];

export const DEFAULT_EXTENDED_CUSTOMIZATION: ExtendedLabelCustomization = {
  rollWidthMM: 40,
  rollHeightMM: 30,
  gapMM: 2,
  density: 10,
  speed: 3,
  barcodeType: "CODE128",
  showProductName: true,
  showProductPrice: true,
  showBarcode: true,
  showQRCode: true,
  showStoreURLQR: true,
  qrTargetMode: "store_url",
  qrErrorCorrection: "M",
  qrSizePx: 56,
  labelShape: "rectangle",
  showFooterText: true,
  footerText: "معرض أحمد بحري",
  barcodeHeight: 40,
  nameFontSize: 13,
  priceFontSize: 14,
  enableSerialNumbers: false,
  serialStartNumber: 1001,
  presetName: "marklife_40x30",
  storeUrl: "https://ahmed-bahri.vercel.app",
  elementOrder: [...DEFAULT_LABEL_ELEMENT_ORDER],
  labelBgColor: "#FFFFFF",
  textColor: "#000000",
  borderColor: "#cbd5e1",
  showLogo: false,
  logoUrl: "",
  logoPosition: "top_center",
  logoSizePx: 36,
};

export const GLOBAL_THERMAL_PRESETS: Record<string, Partial<ExtendedLabelCustomization>> = {
  marklife_40x30: {
    rollWidthMM: 40,
    rollHeightMM: 30,
    gapMM: 2,
    density: 10,
    labelShape: "rectangle",
    presetName: "marklife_40x30",
  },
  standard_50x30: {
    rollWidthMM: 50,
    rollHeightMM: 30,
    gapMM: 2,
    density: 10,
    labelShape: "rectangle",
    presetName: "standard_50x30",
  },
  jewelry_25x15: {
    rollWidthMM: 25,
    rollHeightMM: 15,
    gapMM: 2,
    density: 10,
    labelShape: "rectangle",
    presetName: "jewelry_25x15",
  },
  strips_25x50: {
    rollWidthMM: 25,
    rollHeightMM: 50,
    gapMM: 2,
    density: 10,
    labelShape: "rectangle",
    presetName: "strips_25x50",
  },
  logistics_100x75: {
    rollWidthMM: 100,
    rollHeightMM: 75,
    gapMM: 3,
    density: 12,
    labelShape: "rectangle",
    presetName: "logistics_100x75",
  },
  shipping_100x150: {
    rollWidthMM: 100,
    rollHeightMM: 150,
    gapMM: 3,
    density: 12,
    labelShape: "rectangle",
    presetName: "shipping_100x150",
  },
  circular_40x40: {
    rollWidthMM: 40,
    rollHeightMM: 40,
    gapMM: 2,
    density: 11,
    labelShape: "circle",
    presetName: "circular_40x40",
  },
  circular_50x50: {
    rollWidthMM: 50,
    rollHeightMM: 50,
    gapMM: 3,
    density: 11,
    labelShape: "circle",
    presetName: "circular_50x50",
  },
  square_50x50: {
    rollWidthMM: 50,
    rollHeightMM: 50,
    gapMM: 3,
    density: 11,
    labelShape: "square",
    presetName: "square_50x50",
  },
  continuous_100: {
    rollWidthMM: 100,
    rollHeightMM: 80,
    gapMM: 0,
    density: 12,
    labelShape: "rectangle",
    presetName: "continuous_100",
  },
};

export const MARKLIFE_X4_PRESETS = GLOBAL_THERMAL_PRESETS;

export interface ThermalPrintJobItem {
  product: Product;
  quantity: number;
  serialNumber?: string;
}

/**
 * Reorders elements by moving target id up or down.
 */
export function moveElementOrder(
  order: LabelElementId[] | undefined,
  id: LabelElementId,
  direction: "up" | "down"
): LabelElementId[] {
  const currentOrder = order && order.length > 0 ? order : [...DEFAULT_LABEL_ELEMENT_ORDER];
  const index = currentOrder.indexOf(id);
  if (index === -1) return currentOrder;
  const newIndex = direction === "up" ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= currentOrder.length) return currentOrder;

  const result = [...currentOrder];
  const temp = result[index];
  result[index] = result[newIndex];
  result[newIndex] = temp;
  return result;
}

/**
 * Resolves the string payload to encode into QR code based on user settings.
 */
export function resolveQRPayload(
  product: Product,
  config: ExtendedLabelCustomization
): string {
  const storeBase = config.storeUrl || "https://ahmed-bahri.vercel.app";

  if (config.qrTargetMode === "store_url") {
    return storeBase;
  } else if (config.qrTargetMode === "product_url") {
    return `${storeBase}/products/${product.id}`;
  } else {
    return product.qrCode || product.barcode || `${storeBase}/products/${product.id}`;
  }
}

// ─── 1. TSPL COMMAND SYNTHESIZER (MARK LIFE X4 & TSC) ─────────────────────────

export function generateTSPLCommands(
  items: ThermalPrintJobItem[],
  config: ExtendedLabelCustomization
): string {
  const commands: string[] = [];

  const widthMM = config.labelShape === "square" || config.labelShape === "circle"
    ? config.rollWidthMM
    : config.rollWidthMM;
  const heightMM = config.labelShape === "square" || config.labelShape === "circle"
    ? config.rollWidthMM
    : config.rollHeightMM;

  commands.push(`SIZE ${widthMM} mm, ${heightMM} mm`);
  commands.push(`GAP ${config.gapMM} mm, 0 mm`);
  commands.push(`DENSITY ${Math.min(15, Math.max(1, config.density))}`);
  commands.push(`SPEED ${Math.min(5, Math.max(1, config.speed))}`);
  commands.push(`DIRECTION 1`);
  commands.push(`CODEPAGE 1256`);

  let currentSerial = config.serialStartNumber;
  const elementOrder = config.elementOrder && config.elementOrder.length > 0
    ? config.elementOrder
    : DEFAULT_LABEL_ELEMENT_ORDER;

  for (const item of items) {
    const qty = Math.max(1, item.quantity);
    const p = item.product;
    const qrPayload = resolveQRPayload(p, config);

    for (let q = 0; q < qty; q++) {
      commands.push(`CLS`);

      const dotPerMM = 8;
      const labelWidthDots = widthMM * dotPerMM;
      let yCursor = config.labelShape === "circle" ? 25 : 15;

      for (const elemId of elementOrder) {
        if (elemId === "name") {
          if (config.showProductName && p.name) {
            const cleanName = p.name.replace(/"/g, '\\"');
            commands.push(`TEXT ${labelWidthDots / 2},${yCursor},"3.TTS",0,1,1,2,"${cleanName}"`);
            yCursor += 28;
          }
        } else if (elemId === "price") {
          if (config.showProductPrice && p.retailPrice) {
            const priceStr = `${p.retailPrice.toLocaleString()} IQD`;
            commands.push(`TEXT ${labelWidthDots / 2},${yCursor},"4.TTS",0,1,1,2,"${priceStr}"`);
            yCursor += 32;
          }
        } else if (elemId === "codes") {
          if (config.showBarcode && p.barcode) {
            const barcodeCode = p.barcode.trim();
            const bHeightDots = Math.round(config.barcodeHeight * 1.5);
            commands.push(
              `BARCODE ${Math.round(labelWidthDots * 0.1)},${yCursor},"128",${bHeightDots},1,0,2,2,"${barcodeCode}"`
            );
            yCursor += bHeightDots + 20;
          }

          if ((config.showQRCode || config.showStoreURLQR) && qrPayload) {
            const ecc = config.qrErrorCorrection || "M";
            commands.push(`QRCODE ${Math.round(labelWidthDots * 0.35)},${yCursor},${ecc},4,A,0,"${qrPayload}"`);
            yCursor += 60;
          }
        } else if (elemId === "footer") {
          if (config.enableSerialNumbers) {
            const serialStr = `S/N: ${currentSerial++}`;
            commands.push(`TEXT ${labelWidthDots / 2},${yCursor},"2.TTS",0,1,1,2,"${serialStr}"`);
            yCursor += 18;
          }

          if (config.showFooterText && config.footerText) {
            const footer = config.footerText.replace(/"/g, '\\"');
            commands.push(`TEXT ${labelWidthDots / 2},${yCursor},"2.TTS",0,1,1,2,"${footer}"`);
          }
        }
      }

      commands.push(`PRINT 1,1`);
    }
  }

  return commands.join("\n");
}

/**
 * Generates ZPL commands (Zebra compatibility) with reordering & strict conditional checks.
 */
export function generateZPLCommands(
  items: ThermalPrintJobItem[],
  config: ExtendedLabelCustomization
): string {
  const zpl: string[] = [];
  const widthMM = config.labelShape === "square" || config.labelShape === "circle" ? config.rollWidthMM : config.rollWidthMM;
  const heightMM = config.labelShape === "square" || config.labelShape === "circle" ? config.rollWidthMM : config.rollHeightMM;

  const widthDots = widthMM * 8;
  const heightDots = heightMM * 8;
  const elementOrder = config.elementOrder && config.elementOrder.length > 0
    ? config.elementOrder
    : DEFAULT_LABEL_ELEMENT_ORDER;

  for (const item of items) {
    const qty = Math.max(1, item.quantity);
    const p = item.product;
    const qrPayload = resolveQRPayload(p, config);

    for (let q = 0; q < qty; q++) {
      zpl.push("^XA");
      zpl.push(`^PW${widthDots}`);
      zpl.push(`^LL${heightDots}`);
      zpl.push(`^PR${config.speed}`);
      zpl.push(`^MD${config.density}`);

      let y = config.labelShape === "circle" ? 28 : 20;

      for (const elemId of elementOrder) {
        if (elemId === "name") {
          if (config.showProductName && p.name) {
            zpl.push(`^FO20,${y}^A0N,25,25^FD${p.name}^FS`);
            y += 30;
          }
        } else if (elemId === "price") {
          if (config.showProductPrice && p.retailPrice) {
            zpl.push(`^FO20,${y}^A0N,30,30^FD${p.retailPrice.toLocaleString()} IQD^FS`);
            y += 35;
          }
        } else if (elemId === "codes") {
          if (config.showBarcode && p.barcode) {
            zpl.push(`^FO20,${y}^BCN,${config.barcodeHeight},Y,N,N^FD${p.barcode}^FS`);
            y += config.barcodeHeight + 25;
          }

          if ((config.showQRCode || config.showStoreURLQR) && qrPayload) {
            zpl.push(`^FO50,${y}^BQN,2,4^FDQA,${qrPayload}^FS`);
            y += 65;
          }
        } else if (elemId === "footer") {
          if (config.showFooterText && config.footerText) {
            zpl.push(`^FO20,${y}^A0N,18,18^FD${config.footerText}^FS`);
          }
        }
      }

      zpl.push("^XZ");
    }
  }

  return zpl.join("\n");
}

// ─── 2. WEB BLUETOOTH & WEB USB DIRECT HARDWARE CONNECTOR ────────────────────

export interface DeviceConnectionStatus {
  connected: boolean;
  deviceName: string | null;
  connectionType: "bluetooth" | "usb" | "none";
  error: string | null;
}

export async function connectWebBluetoothPrinter(): Promise<{
  device: any;
  characteristic: any;
  name: string;
}> {
  if (typeof window === "undefined" || !("bluetooth" in navigator)) {
    throw new Error("متصفحك لا يدعم خاصية الاتصال اللاسلكي المباشر Web Bluetooth.");
  }

  const device = await (navigator as any).bluetooth.requestDevice({
    filters: [
      { namePrefix: "Marklife" },
      { namePrefix: "X4" },
      { namePrefix: "XP-" },
      { namePrefix: "POS" },
      { namePrefix: "BT" },
      { namePrefix: "Printer" },
      { services: ["00001101-0000-1000-8000-00805f9b34fb"] },
    ],
    optionalServices: [
      "00001101-0000-1000-8000-00805f9b34fb",
      "000018f0-0000-1000-8000-00805f9b34fb",
      "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    ],
  });

  const server = await device.gatt.connect();
  const primaryServices = await server.getPrimaryServices();

  if (!primaryServices || primaryServices.length === 0) {
    throw new Error("لم يتم العثور على خدمات طباعة مناسبة في جهاز البلوتوث المكتشف.");
  }

  const service = primaryServices[0];
  const characteristics = await service.getCharacteristics();
  
  if (!characteristics || characteristics.length === 0) {
    throw new Error("تعذّر العثور على قناة الإرسال للجهاز.");
  }

  const characteristic = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse) || characteristics[0];

  return {
    device,
    characteristic,
    name: device.name || "Marklife X4 Thermal Printer",
  };
}

export async function sendTSPLToBluetooth(
  characteristic: any,
  tsplData: string
): Promise<void> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(tsplData);
  const chunkSize = 100;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function connectWebUSBPrinter(): Promise<any> {
  if (typeof window === "undefined" || !("usb" in navigator)) {
    throw new Error("متصفحك لا يدعم الاتصال المباشر عبر الكابل Web USB.");
  }

  const device = await (navigator as any).usb.requestDevice({
    filters: [{ classCode: 7 }],
  });

  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }
  await device.claimInterface(0);

  return device;
}

export async function sendTSPLToUSB(device: any, tsplData: string): Promise<void> {
  const encoder = new TextEncoder();
  const data = encoder.encode(tsplData);
  const endpoints = device.configuration.interfaces[0].alternate.endpoints;
  const outEndpoint = endpoints.find((e: any) => e.direction === "out");

  if (!outEndpoint) {
    throw new Error("لم يتم العثور على مخرج بيانات USB في طابعة الملصقات.");
  }

  await device.transferOut(outEndpoint.endpointNumber, data);
}

// ─── 3. EXTERNAL APP HANDSHAKING & DEEP LINKING ───────────────────────────────

export async function handshakeWithMarklifeApp(
  tsplString: string,
  imageBlob?: Blob,
  filename = "label_print_payload"
): Promise<boolean> {
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      const fileToShare = imageBlob
        ? new File([imageBlob], `${filename}.png`, { type: "image/png" })
        : new File([tsplString], `${filename}.tspl`, { type: "text/plain" });

      if ((navigator as any).canShare && (navigator as any).canShare({ files: [fileToShare] })) {
        await (navigator as any).share({
          title: "طباعة ملصق Marklife X4",
          text: "بيانات ملصق الباركود الجاهزة للطباعة",
          files: [fileToShare],
        });
        return true;
      }
    } catch (err) {
      console.warn("[ThermalEngine] Web Share cancelled or unsupported:", err);
    }
  }

  try {
    const encodedPayload = encodeURIComponent(tsplString);
    const deepLinkUrl = `marklife://print?data=${encodedPayload}`;
    window.location.href = deepLinkUrl;
    return true;
  } catch (err) {
    console.error("[ThermalEngine] Deep link handshake failed:", err);
  }

  return false;
}

// ─── 4. MULTI-FORMAT EXPORT ENGINE (PNG, JPEG, VECTOR PDF, TSPL, ZPL) ──────────

/**
 * Exports thermal labels as a High-DPI Vector PDF document (jsPDF) matching exact label mm dimensions, shape, colors, logo, reordering & strict conditional visibility.
 */
export async function exportLabelsAsPDF(
  items: ThermalPrintJobItem[],
  config: ExtendedLabelCustomization,
  filename = "thermal_labels.pdf"
): Promise<void> {
  const widthMM = config.labelShape === "square" || config.labelShape === "circle" ? config.rollWidthMM : config.rollWidthMM;
  const heightMM = config.labelShape === "square" || config.labelShape === "circle" ? config.rollWidthMM : config.rollHeightMM;

  const pdf = new jsPDF({
    orientation: widthMM > heightMM ? "landscape" : "portrait",
    unit: "mm",
    format: [widthMM, heightMM],
  });

  const elementOrder = config.elementOrder && config.elementOrder.length > 0
    ? config.elementOrder
    : DEFAULT_LABEL_ELEMENT_ORDER;

  let pageIndex = 0;

  for (const item of items) {
    const qty = Math.max(1, item.quantity);
    const p = item.product;
    const qrPayload = resolveQRPayload(p, config);

    for (let q = 0; q < qty; q++) {
      if (pageIndex > 0) {
        pdf.addPage([widthMM, heightMM], widthMM > heightMM ? "landscape" : "portrait");
      }

      // Background fill color if not pure white
      if (config.labelBgColor && config.labelBgColor.toUpperCase() !== "#FFFFFF") {
        pdf.setFillColor(config.labelBgColor);
        pdf.rect(0, 0, widthMM, heightMM, "F");
      }

      // Shape Guide with Safe Area Inset
      pdf.setLineWidth(0.2);
      pdf.setDrawColor(config.borderColor || "#cbd5e1");

      const isCircle = config.labelShape === "circle";
      const safeWidthMM = isCircle ? widthMM * 0.707 : widthMM - 2;

      if (isCircle) {
        const radius = Math.min(widthMM, heightMM) / 2 - 0.5;
        pdf.circle(widthMM / 2, heightMM / 2, radius);
      } else {
        pdf.rect(0.5, 0.5, widthMM - 1, heightMM - 1);
      }

      let yMM = isCircle ? heightMM * 0.16 : 4;

      // Brand Logo Integration
      if (config.showLogo && config.logoUrl) {
        try {
          const lSizeMM = Math.min(10, (config.logoSizePx || 36) * 0.25);
          let logoX = (widthMM - lSizeMM) / 2;
          if (config.logoPosition === "top_left") logoX = 2;
          if (config.logoPosition === "top_right") logoX = widthMM - lSizeMM - 2;

          pdf.addImage(config.logoUrl, "PNG", logoX, yMM, lSizeMM, lSizeMM);
          if (config.logoPosition === "top_center") yMM += lSizeMM + 1;
        } catch (e) {
          console.warn("[ThermalEngine] PDF Logo render error:", e);
        }
      }

      for (const elemId of elementOrder) {
        if (elemId === "name") {
          if (config.showProductName && p.name) {
            pdf.setFontSize(Math.max(7, Math.round(config.nameFontSize * 0.75)));
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(config.textColor || "#0f172a");
            
            const splitText = pdf.splitTextToSize(p.name, safeWidthMM);
            pdf.text(splitText, widthMM / 2, yMM, { align: "center" });
            yMM += splitText.length * 3.5 + 1;
          }
        } else if (elemId === "price") {
          if (config.showProductPrice && p.retailPrice) {
            pdf.setFontSize(Math.max(8, Math.round(config.priceFontSize * 0.85)));
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(config.textColor || "#2563eb");
            pdf.text(`${p.retailPrice.toLocaleString()} IQD`, widthMM / 2, yMM, { align: "center" });
            yMM += 4.5;
          }
        } else if (elemId === "codes") {
          if (config.showBarcode && p.barcode) {
            try {
              const canvas = document.createElement("canvas");
              JsBarcode(canvas, p.barcode.trim(), {
                format: config.barcodeType || "CODE128",
                width: 1.5,
                height: config.barcodeHeight,
                displayValue: true,
                fontSize: 9,
                margin: 2,
              });
              const barcodeDataUrl = canvas.toDataURL("image/png");
              const bWidthMM = safeWidthMM * 0.9;
              const bHeightMM = Math.min(10, heightMM * 0.25);
              pdf.addImage(barcodeDataUrl, "PNG", (widthMM - bWidthMM) / 2, yMM, bWidthMM, bHeightMM);
              yMM += bHeightMM + 2;
            } catch (e) {
              console.warn("[ThermalEngine] Barcode PDF render error:", e);
            }
          }

          if ((config.showQRCode || config.showStoreURLQR) && qrPayload) {
            try {
              const qrDataUrl = await QRCode.toDataURL(qrPayload, {
                margin: 1,
                errorCorrectionLevel: config.qrErrorCorrection || "M",
              });
              const qrSizeMM = Math.min(13, heightMM * 0.3);
              pdf.addImage(qrDataUrl, "PNG", (widthMM - qrSizeMM) / 2, yMM, qrSizeMM, qrSizeMM);
              yMM += qrSizeMM + 2;
            } catch (e) {
              console.warn("[ThermalEngine] QR PDF render error:", e);
            }
          }
        } else if (elemId === "footer") {
          if (config.showFooterText && config.footerText) {
            pdf.setFontSize(5.5);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(config.textColor || "#64748b");
            const footerY = isCircle ? heightMM * 0.84 : heightMM - 2;
            pdf.text(config.footerText, widthMM / 2, footerY, { align: "center" });
          }
        }
      }

      pageIndex++;
    }
  }

  pdf.save(filename);
}

/**
 * Renders an offscreen canvas with Circular Safe-Area padding, Colors, Site Logo, Reordering & Strict Conditional Checks.
 */
export async function renderLabelToImageBlob(
  product: Product,
  config: ExtendedLabelCustomization,
  format: "image/png" | "image/jpeg" = "image/png"
): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("صناعة الصورة تتطلب بيئة المتصفح.");
  }

  const dpi = 300;
  const mmToPx = (mm: number) => Math.round((mm / 25.4) * dpi);

  const widthMM = config.labelShape === "square" || config.labelShape === "circle" ? config.rollWidthMM : config.rollWidthMM;
  const heightMM = config.labelShape === "square" || config.labelShape === "circle" ? config.rollWidthMM : config.rollHeightMM;

  const canvasWidth = mmToPx(widthMM);
  const canvasHeight = mmToPx(heightMM);
  const isCircle = config.labelShape === "circle";
  const elementOrder = config.elementOrder && config.elementOrder.length > 0
    ? config.elementOrder
    : DEFAULT_LABEL_ELEMENT_ORDER;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Could not initialize 2D Context");

  // Background Customization
  ctx.fillStyle = config.labelBgColor || "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (isCircle) {
    ctx.beginPath();
    ctx.arc(canvasWidth / 2, canvasHeight / 2, canvasWidth / 2 - 4, 0, Math.PI * 2);
    ctx.strokeStyle = config.borderColor || "#cbd5e1";
    ctx.lineWidth = Math.round(dpi / 100);
    ctx.stroke();
    ctx.clip(); // Circle masking
  } else {
    ctx.strokeStyle = config.borderColor || "#cbd5e1";
    ctx.lineWidth = Math.round(dpi / 100);
    ctx.strokeRect(4, 4, canvasWidth - 8, canvasHeight - 8);
  }

  // Circular Safe Area width constraint (70.7% of diameter)
  const maxContentWidth = isCircle ? canvasWidth * 0.707 : canvasWidth * 0.9;
  let yCursor = Math.round(canvasHeight * (isCircle ? 0.16 : 0.08));

  // Brand Logo Drawing
  if (config.showLogo && config.logoUrl) {
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      logoImg.src = config.logoUrl;
      await new Promise((res) => { logoImg.onload = res; logoImg.onerror = res; });
      
      const logoPx = Math.round((config.logoSizePx || 36) * (dpi / 96));
      let logoX = (canvasWidth - logoPx) / 2;
      if (config.logoPosition === "top_left") logoX = 10;
      if (config.logoPosition === "top_right") logoX = canvasWidth - logoPx - 10;

      if (config.logoPosition === "background_watermark") {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.drawImage(logoImg, (canvasWidth - logoPx * 2) / 2, (canvasHeight - logoPx * 2) / 2, logoPx * 2, logoPx * 2);
        ctx.restore();
      } else {
        ctx.drawImage(logoImg, logoX, yCursor, logoPx, logoPx);
        if (config.logoPosition === "top_center") yCursor += logoPx + 8;
      }
    } catch (e) {
      console.warn("[ThermalEngine] Canvas Logo draw error:", e);
    }
  }

  for (const elemId of elementOrder) {
    if (elemId === "name") {
      if (config.showProductName && product.name) {
        ctx.fillStyle = config.textColor || "#0f172a";
        ctx.font = `bold ${Math.round(canvasHeight * 0.11)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(product.name, canvasWidth / 2, yCursor, maxContentWidth);
        yCursor += Math.round(canvasHeight * 0.13);
      }
    } else if (elemId === "price") {
      if (config.showProductPrice && product.retailPrice) {
        ctx.fillStyle = config.textColor || "#2563eb";
        ctx.font = `black ${Math.round(canvasHeight * 0.13)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`${product.retailPrice.toLocaleString()} IQD`, canvasWidth / 2, yCursor);
        yCursor += Math.round(canvasHeight * 0.15);
      }
    } else if (elemId === "codes") {
      if (config.showBarcode && product.barcode) {
        const barcodeCanvas = document.createElement("canvas");
        JsBarcode(barcodeCanvas, product.barcode.trim(), {
          format: config.barcodeType || "CODE128",
          width: 2,
          height: 55,
          displayValue: true,
          fontSize: 13,
        });

        const bWidth = Math.round(maxContentWidth * 0.9);
        const bHeight = Math.round(canvasHeight * 0.28);
        ctx.drawImage(barcodeCanvas, (canvasWidth - bWidth) / 2, yCursor, bWidth, bHeight);
        yCursor += bHeight + 8;
      }

      const qrPayload = resolveQRPayload(product, config);
      if ((config.showQRCode || config.showStoreURLQR) && qrPayload) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qrPayload, {
            margin: 1,
            errorCorrectionLevel: config.qrErrorCorrection || "M",
          });
          const qrImg = new Image();
          qrImg.src = qrDataUrl;
          await new Promise((res) => { qrImg.onload = res; });
          const qrSize = Math.round(canvasHeight * 0.26);
          ctx.drawImage(qrImg, (canvasWidth - qrSize) / 2, yCursor, qrSize, qrSize);
          yCursor += qrSize + 6;
        } catch (e) {
          console.warn("[ThermalEngine] Canvas QR draw error:", e);
        }
      }
    } else if (elemId === "footer") {
      if (config.showFooterText && config.footerText) {
        ctx.fillStyle = config.textColor || "#64748b";
        ctx.font = `bold ${Math.round(canvasHeight * 0.07)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(config.footerText, canvasWidth / 2, canvasHeight - Math.round(canvasHeight * (isCircle ? 0.15 : 0.09)));
      }
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export image blob"));
      },
      format,
      0.95
    );
  });
}
