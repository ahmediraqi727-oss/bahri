/**
 * thermal-printer-engine.ts
 *
 * Enterprise Thermal Label Printing & Hardware Subsystem for Ahmed Bahri Store.
 * Tailored specifically for Marklife X4 and general ESC/POS, TSPL, ZPL thermal printers.
 *
 * Provides:
 * - TSPL / ZPL / ESC-POS Command Synthesizer (Exact density, speed, gap retraction)
 * - Web Bluetooth API & Web USB API Direct Hardware Printing
 * - External App Handshaking & Deep Linking (Marklife App / Web Share API)
 * - Multi-Format Export Engine (PNG, JPEG, Vector PDF via jsPDF, TSPL, ZPL)
 */

import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import type { Product } from "./types";

export type BarcodeSymbology = "CODE128" | "EAN13" | "EAN8" | "CODE39" | "UPC";
export type ThermalProtocol = "TSPL" | "ZPL" | "ESCPOS";

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
  showFooterText: boolean;
  footerText: string;
  barcodeHeight: number; // in px
  nameFontSize: number;  // in px
  priceFontSize: number; // in px
  enableSerialNumbers: boolean;
  serialStartNumber: number;
  presetName: string;
}

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
  showFooterText: true,
  footerText: "معرض أحمد بحري",
  barcodeHeight: 45,
  nameFontSize: 13,
  priceFontSize: 14,
  enableSerialNumbers: false,
  serialStartNumber: 1001,
  presetName: "marklife_40x30",
};

export const MARKLIFE_X4_PRESETS: Record<string, Partial<ExtendedLabelCustomization>> = {
  marklife_40x30: {
    rollWidthMM: 40,
    rollHeightMM: 30,
    gapMM: 2,
    density: 10,
    presetName: "marklife_40x30",
  },
  standard_50x30: {
    rollWidthMM: 50,
    rollHeightMM: 30,
    gapMM: 2,
    density: 10,
    presetName: "standard_50x30",
  },
  shipping_60x40: {
    rollWidthMM: 60,
    rollHeightMM: 40,
    gapMM: 3,
    density: 12,
    presetName: "shipping_60x40",
  },
};

export interface ThermalPrintJobItem {
  product: Product;
  quantity: number;
  serialNumber?: string;
}

// ─── 1. TSPL COMMAND SYNTHESIZER (MARK LIFE X4 & TSC) ─────────────────────────

/**
 * Generates exact TSPL commands for Marklife X4 / TSC thermal label printers.
 */
export function generateTSPLCommands(
  items: ThermalPrintJobItem[],
  config: ExtendedLabelCustomization
): string {
  const commands: string[] = [];

  // Setup label dimensions, gap, burn density, speed, direction
  commands.push(`SIZE ${config.rollWidthMM} mm, ${config.rollHeightMM} mm`);
  commands.push(`GAP ${config.gapMM} mm, 0 mm`);
  commands.push(`DENSITY ${Math.min(15, Math.max(1, config.density))}`);
  commands.push(`SPEED ${Math.min(5, Math.max(1, config.speed))}`);
  commands.push(`DIRECTION 1`);
  commands.push(`CODEPAGE 1256`); // Arabic Windows codepage support

  let currentSerial = config.serialStartNumber;

  for (const item of items) {
    const qty = Math.max(1, item.quantity);
    const p = item.product;

    for (let q = 0; q < qty; q++) {
      commands.push(`CLS`); // Clear buffer

      let yCursor = 15; // in dots (203 DPI -> 8 dots per mm)
      const dotPerMM = 8;
      const labelWidthDots = config.rollWidthMM * dotPerMM;

      // Title / Product Name
      if (config.showProductName && p.name) {
        // Truncate name for small thermal display if needed
        const cleanName = p.name.replace(/"/g, '\\"');
        commands.push(`TEXT ${labelWidthDots / 2},${yCursor},"3.TTS",0,1,1,2,"${cleanName}"`);
        yCursor += 30;
      }

      // Price
      if (config.showProductPrice && p.retailPrice) {
        const priceStr = `${p.retailPrice.toLocaleString()} IQD`;
        commands.push(`TEXT ${labelWidthDots / 2},${yCursor},"4.TTS",0,1,1,2,"${priceStr}"`);
        yCursor += 35;
      }

      // Linear Barcode
      if (config.showBarcode && p.barcode) {
        const barcodeCode = p.barcode.trim();
        const bHeightDots = Math.round(config.barcodeHeight * 1.5);
        commands.push(
          `BARCODE ${Math.round(labelWidthDots * 0.15)},${yCursor},"128",${bHeightDots},1,0,2,2,"${barcodeCode}"`
        );
        yCursor += bHeightDots + 25;
      }

      // 2D QR Code
      if (config.showQRCode && p.qrCode) {
        const qrData = p.qrCode.trim();
        commands.push(`QRCODE ${Math.round(labelWidthDots * 0.35)},${yCursor},L,4,A,0,"${qrData}"`);
        yCursor += 65;
      }

      // Serial Number (if enabled)
      if (config.enableSerialNumbers) {
        const serialStr = `S/N: ${currentSerial++}`;
        commands.push(`TEXT ${labelWidthDots / 2},${yCursor},"2.TTS",0,1,1,2,"${serialStr}"`);
        yCursor += 20;
      }

      // Custom Footer Text
      if (config.showFooterText && config.footerText) {
        const footer = config.footerText.replace(/"/g, '\\"');
        commands.push(`TEXT ${labelWidthDots / 2},${yCursor},"2.TTS",0,1,1,2,"${footer}"`);
      }

      // Output print command
      commands.push(`PRINT 1,1`);
    }
  }

  return commands.join("\n");
}

/**
 * Generates ZPL commands (Zebra compatibility)
 */
export function generateZPLCommands(
  items: ThermalPrintJobItem[],
  config: ExtendedLabelCustomization
): string {
  const zpl: string[] = [];
  const widthDots = config.rollWidthMM * 8;
  const heightDots = config.rollHeightMM * 8;

  for (const item of items) {
    const qty = Math.max(1, item.quantity);
    const p = item.product;

    for (let q = 0; q < qty; q++) {
      zpl.push("^XA");
      zpl.push(`^PW${widthDots}`);
      zpl.push(`^LL${heightDots}`);
      zpl.push(`^PR${config.speed}`);
      zpl.push(`^MD${config.density}`);

      let y = 20;

      if (config.showProductName && p.name) {
        zpl.push(`^FO20,${y}^A0N,25,25^FD${p.name}^FS`);
        y += 30;
      }

      if (config.showProductPrice && p.retailPrice) {
        zpl.push(`^FO20,${y}^A0N,30,30^FD${p.retailPrice.toLocaleString()} IQD^FS`);
        y += 35;
      }

      if (config.showBarcode && p.barcode) {
        zpl.push(`^FO20,${y}^BCN,${config.barcodeHeight},Y,N,N^FD${p.barcode}^FS`);
        y += config.barcodeHeight + 25;
      }

      if (config.showQRCode && p.qrCode) {
        zpl.push(`^FO50,${y}^BQN,2,4^FDQA,${p.qrCode}^FS`);
        y += 65;
      }

      if (config.showFooterText && config.footerText) {
        zpl.push(`^FO20,${y}^A0N,18,18^FD${config.footerText}^FS`);
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

/**
 * Connects directly to wireless thermal printer via Web Bluetooth API (navigator.bluetooth).
 */
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
      { services: ["00001101-0000-1000-8000-00805f9b34fb"] }, // Serial Port Profile (SPP)
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

/**
 * Sends binary TSPL / ESC-POS commands over Web Bluetooth GATT characteristic in chunks.
 */
export async function sendTSPLToBluetooth(
  characteristic: any,
  tsplData: string
): Promise<void> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(tsplData);
  const chunkSize = 100; // Chunk size for Bluetooth SPP stability

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    // Small delay to prevent buffer overrun on thermal microcontroller
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Connects directly to wired thermal printer via Web USB API (navigator.usb).
 */
export async function connectWebUSBPrinter(): Promise<any> {
  if (typeof window === "undefined" || !("usb" in navigator)) {
    throw new Error("متصفحك لا يدعم الاتصال المباشر عبر الكابل Web USB.");
  }

  const device = await (navigator as any).usb.requestDevice({
    filters: [
      { classCode: 7 }, // Printer Class
    ],
  });

  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }
  await device.claimInterface(0);

  return device;
}

/**
 * Sends raw TSPL bytes over Web USB endpoint.
 */
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

/**
 * Shares label data payload directly to Marklife mobile/desktop companion app
 * using Web Share API (navigator.share) or Custom URI Deep Linking.
 */
export async function handshakeWithMarklifeApp(
  tsplString: string,
  imageBlob?: Blob,
  filename = "label_print_payload"
): Promise<boolean> {
  // 1. Try Web Share API (Mobile Apps File Handshake)
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

  // 2. Fallback to custom Deep Link URI scheme (e.g. marklife:// or intent://)
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
 * Exports thermal labels as a High-DPI Vector PDF document (jsPDF) matching exact label mm dimensions.
 */
export async function exportLabelsAsPDF(
  items: ThermalPrintJobItem[],
  config: ExtendedLabelCustomization,
  filename = "thermal_labels.pdf"
): Promise<void> {
  const widthMM = config.rollWidthMM;
  const heightMM = config.rollHeightMM;

  const pdf = new jsPDF({
    orientation: widthMM > heightMM ? "landscape" : "portrait",
    unit: "mm",
    format: [widthMM, heightMM],
  });

  let pageIndex = 0;

  for (const item of items) {
    const qty = Math.max(1, item.quantity);
    const p = item.product;

    for (let q = 0; q < qty; q++) {
      if (pageIndex > 0) {
        pdf.addPage([widthMM, heightMM], widthMM > heightMM ? "landscape" : "portrait");
      }

      // Label background & border guide
      pdf.setLineWidth(0.1);
      pdf.setDrawColor(220, 220, 220);
      pdf.rect(0.5, 0.5, widthMM - 1, heightMM - 1);

      let yMM = 4;

      // Product Name
      if (config.showProductName && p.name) {
        pdf.setFontSize(Math.max(7, Math.round(config.nameFontSize * 0.75)));
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(15, 23, 42);
        
        // Wrap text to fit widthMM
        const splitText = pdf.splitTextToSize(p.name, widthMM - 4);
        pdf.text(splitText, widthMM / 2, yMM, { align: "center" });
        yMM += splitText.length * 4 + 1;
      }

      // Retail Price
      if (config.showProductPrice && p.retailPrice) {
        pdf.setFontSize(Math.max(8, Math.round(config.priceFontSize * 0.85)));
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(37, 99, 235);
        pdf.text(`${p.retailPrice.toLocaleString()} IQD`, widthMM / 2, yMM, { align: "center" });
        yMM += 5;
      }

      // Barcode image insertion
      if (config.showBarcode && p.barcode) {
        try {
          const canvas = document.createElement("canvas");
          JsBarcode(canvas, p.barcode.trim(), {
            format: config.barcodeType || "CODE128",
            width: 1.5,
            height: config.barcodeHeight,
            displayValue: true,
            fontSize: 10,
            margin: 2,
          });
          const barcodeDataUrl = canvas.toDataURL("image/png");
          const bWidthMM = widthMM * 0.8;
          const bHeightMM = Math.min(12, heightMM * 0.3);
          pdf.addImage(barcodeDataUrl, "PNG", (widthMM - bWidthMM) / 2, yMM, bWidthMM, bHeightMM);
          yMM += bHeightMM + 2;
        } catch (e) {
          console.warn("[ThermalEngine] Barcode PDF render error:", e);
        }
      }

      // QR Code image insertion
      if (config.showQRCode && p.qrCode) {
        try {
          const qrDataUrl = await QRCode.toDataURL(p.qrCode.trim(), { margin: 1 });
          const qrSizeMM = Math.min(14, heightMM * 0.35);
          pdf.addImage(qrDataUrl, "PNG", (widthMM - qrSizeMM) / 2, yMM, qrSizeMM, qrSizeMM);
          yMM += qrSizeMM + 2;
        } catch (e) {
          console.warn("[ThermalEngine] QR PDF render error:", e);
        }
      }

      // Footer
      if (config.showFooterText && config.footerText) {
        pdf.setFontSize(6);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 116, 139);
        pdf.text(config.footerText, widthMM / 2, heightMM - 2, { align: "center" });
      }

      pageIndex++;
    }
  }

  pdf.save(filename);
}

/**
 * Renders an offscreen canvas and exports label as high-DPI PNG or JPEG Blob.
 */
export async function renderLabelToImageBlob(
  product: Product,
  config: ExtendedLabelCustomization,
  format: "image/png" | "image/jpeg" = "image/png"
): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("صناعة الصورة تتطلب بيئة المتصفح.");
  }

  const dpi = 300; // High DPI for thermal printing
  const mmToPx = (mm: number) => Math.round((mm / 25.4) * dpi);

  const canvasWidth = mmToPx(config.rollWidthMM);
  const canvasHeight = mmToPx(config.rollHeightMM);

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Could not initialize 2D Context");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Border guide
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = Math.round(dpi / 100);
  ctx.strokeRect(4, 4, canvasWidth - 8, canvasHeight - 8);

  let yCursor = Math.round(canvasHeight * 0.1);

  // Title
  if (config.showProductName && product.name) {
    ctx.fillStyle = "#0f172a";
    ctx.font = `bold ${Math.round(canvasHeight * 0.12)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(product.name, canvasWidth / 2, yCursor, canvasWidth * 0.9);
    yCursor += Math.round(canvasHeight * 0.14);
  }

  // Price
  if (config.showProductPrice && product.retailPrice) {
    ctx.fillStyle = "#2563eb";
    ctx.font = `black ${Math.round(canvasHeight * 0.14)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${product.retailPrice.toLocaleString()} IQD`, canvasWidth / 2, yCursor);
    yCursor += Math.round(canvasHeight * 0.16);
  }

  // Barcode
  if (config.showBarcode && product.barcode) {
    const barcodeCanvas = document.createElement("canvas");
    JsBarcode(barcodeCanvas, product.barcode.trim(), {
      format: config.barcodeType || "CODE128",
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
    });

    const bWidth = Math.round(canvasWidth * 0.8);
    const bHeight = Math.round(canvasHeight * 0.35);
    ctx.drawImage(barcodeCanvas, (canvasWidth - bWidth) / 2, yCursor, bWidth, bHeight);
    yCursor += bHeight + 10;
  }

  // Footer
  if (config.showFooterText && config.footerText) {
    ctx.fillStyle = "#64748b";
    ctx.font = `bold ${Math.round(canvasHeight * 0.08)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(config.footerText, canvasWidth / 2, canvasHeight - Math.round(canvasHeight * 0.12));
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
