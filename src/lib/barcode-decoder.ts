/**
 * barcode-decoder.ts
 *
 * Multi-Format Barcode & QR Code Computer Vision Preprocessing & Decoding Engine.
 * Powered by @zxing/library, native BarcodeDetector API, and jsQR fallback.
 * Includes Mobile Pre-Scaling & Memory-Safe Canvas Normalization Pipeline (max 1000px).
 * Resolves mobile phone OOM pixel reading failures on iOS Safari & Android Chrome.
 */

import {
  BarcodeFormat,
  DecodeHintType,
  MultiFormatReader,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  BinaryBitmap,
} from "@zxing/library";

// Configure hints once
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
]);
hints.set(DecodeHintType.TRY_HARDER, true);

const zxingReader = new MultiFormatReader();
zxingReader.setHints(hints);

/**
 * Specialized computer-vision preprocessor for thermal-printed barcodes and QR codes.
 * Thermal paper has micro-fading, low contrast, specular reflections, and dot-matrix artifacts.
 * This pipeline enhances local module contrast, sharpens module edges, and removes glare.
 */
export function enhanceThermalLabelImage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): ImageData {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1. Min/Max luminance detection for auto-contrast stretching
  let minL = 255;
  let maxL = 0;
  for (let i = 0; i < data.length; i += 8) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }

  const range = maxL - minL || 1;
  const stretchFactor = 255 / range;

  // 2. High-contrast equalization & adaptive binarization for thermal print
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const stretched = (gray - minL) * stretchFactor;
    // Binarization curve tuned for thermal dot matrix: steep cutoff below 135
    const finalVal = stretched < 135 ? Math.max(0, stretched * 0.6) : Math.min(255, stretched * 1.3);
    data[i] = finalVal;
    data[i + 1] = finalVal;
    data[i + 2] = finalVal;
  }

  return imgData;
}

/**
 * Fast-path QR decoder tuned specifically for thermal printed stickers.
 * Uses center-weighted ROI cropping, thermal contrast equalization, and multi-pass jsQR / BarcodeDetector.
 */
export async function decodeThermalOptimizedQR(
  sourceCanvas: HTMLCanvasElement
): Promise<string | null> {
  if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) return null;

  // 1. First attempt: Native BarcodeDetector if available on full frame
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      // @ts-expect-error — BarcodeDetector API
      const detector = new window.BarcodeDetector({
        formats: ["qr_code", "data_matrix", "code_128", "ean_13"],
      });
      const detected = await detector.detect(sourceCanvas);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        return detected[0].rawValue;
      }
    } catch { /* proceed */ }
  }

  // 2. Center-weighted Crop (ROI) for thermal stickers in viewfinder
  // Thermal stickers are typically positioned inside the central 60% of the screen.
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const roiW = Math.round(w * 0.65);
  const roiH = Math.round(h * 0.65);
  const roiX = Math.round((w - roiW) / 2);
  const roiY = Math.round((h - roiH) / 2);

  const roiCanvas = document.createElement("canvas");
  roiCanvas.width = roiW;
  roiCanvas.height = roiH;
  const roiCtx = roiCanvas.getContext("2d", { willReadFrequently: true });
  if (roiCtx) {
    roiCtx.drawImage(sourceCanvas, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH);

    // Try BarcodeDetector on high-density ROI
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        // @ts-expect-error — BarcodeDetector API
        const detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13"] });
        const detected = await detector.detect(roiCanvas);
        if (detected && detected.length > 0 && detected[0].rawValue) {
          return detected[0].rawValue;
        }
      } catch { /* proceed */ }
    }

    // Try jsQR on thermal-enhanced ROI
    try {
      const { default: jsQR } = await import("jsqr");
      const enhancedImageData = enhanceThermalLabelImage(roiCtx, roiW, roiH);
      roiCtx.putImageData(enhancedImageData, 0, 0);

      const qrResult = jsQR(enhancedImageData.data, roiW, roiH, {
        inversionAttempts: "attemptBoth",
      });
      if (qrResult?.data) {
        return qrResult.data;
      }
    } catch { /* proceed */ }
  }

  // 3. Fallback to standard multi-pass decoder on full canvas
  return decodeBarcodeFromCanvas(sourceCanvas);
}

/**
 * Decodes barcode or QR code from a canvas using a 4-pass contrast & binarization pipeline.
 */
export async function decodeBarcodeFromCanvas(
  sourceCanvas: HTMLCanvasElement
): Promise<string | null> {
  if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) return null;

  // Pass 1: High-Speed Native BarcodeDetector API (Sub-millisecond GPU/C++ hardware decoding)
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      // @ts-expect-error — BarcodeDetector API
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e", "data_matrix", "aztec", "pdf417"],
      });
      const detected = await detector.detect(sourceCanvas);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        return detected[0].rawValue;
      }
    } catch {
      // Continue to Pass 2
    }
  }

  // Pass 2: Raw canvas decode with ZXing MultiFormatReader
  try {
    const luminanceSource = new HTMLCanvasElementLuminanceSource(sourceCanvas);
    const binarizer = new HybridBinarizer(luminanceSource);
    const bitmap = new BinaryBitmap(binarizer);
    const result = zxingReader.decode(bitmap);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Continue to Pass 3
  }

  // Create an off-screen processing canvas for image optimization
  const processCanvas = document.createElement("canvas");
  const maxDim = 1000;
  let width = sourceCanvas.width;
  let height = sourceCanvas.height;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  processCanvas.width = width;
  processCanvas.height = height;
  const ctx = processCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  // Pass 2: Contrast & Sharpening Preprocessing
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const contrastFactor = 1.6;

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      let adjusted = (gray - 128) * contrastFactor + 128;
      if (adjusted < 0) adjusted = 0;
      if (adjusted > 255) adjusted = 255;

      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
    ctx.putImageData(imageData, 0, 0);

    const luminanceSource = new HTMLCanvasElementLuminanceSource(processCanvas);
    const binarizer = new HybridBinarizer(luminanceSource);
    const bitmap = new BinaryBitmap(binarizer);
    const result = zxingReader.decode(bitmap);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Continue to Pass 3
  }

  // Pass 3: High-Thresholding Binarization for glare/shiny label captures
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const binary = gray > 120 ? 255 : 0;
      data[i] = binary;
      data[i + 1] = binary;
      data[i + 2] = binary;
    }
    ctx.putImageData(imageData, 0, 0);

    const luminanceSource = new HTMLCanvasElementLuminanceSource(processCanvas);
    const binarizer = new HybridBinarizer(luminanceSource);
    const bitmap = new BinaryBitmap(binarizer);
    const result = zxingReader.decode(bitmap);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Continue to Pass 4
  }

  // Pass 4: Fallback to jsQR
  try {
    const { default: jsQR } = await import("jsqr");
    const imageData = ctx.getImageData(0, 0, width, height);
    const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    if (qrResult?.data) {
      return qrResult.data;
    }
  } catch {
    // Silent
  }

  return null;
}

/**
 * Rotates a canvas by 90 degrees clockwise (solves mobile portrait EXIF photo orientation).
 */
function rotateCanvas90(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const rotated = document.createElement("canvas");
  rotated.width = sourceCanvas.height;
  rotated.height = sourceCanvas.width;
  const ctx = rotated.getContext("2d", { willReadFrequently: true });
  if (ctx) {
    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  }
  return rotated;
}

/**
 * Safely loads an uploaded File into an HTMLImageElement or ImageBitmap
 * across all mobile browsers (iOS Safari, Android Chrome, Tablets, Desktop).
 */
async function safeLoadImage(file: File): Promise<HTMLImageElement | ImageBitmap | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fallback to FileReader + HTMLImageElement
    }
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Decodes barcode/QR from an uploaded File or Blob object with mobile pre-scaling (max 1000px),
 * memory-safe async canvas normalization, and 90-degree rotation pass.
 */
export async function decodeBarcodeFromFile(file: File): Promise<string | null> {
  try {
    const img = await safeLoadImage(file);
    if (!img) return null;

    // Mobile Pre-Scaling Pipeline: limit max dimension to 1000px to prevent mobile OOM context drop
    const maxDim = 1000;
    let width = img.width;
    let height = img.height;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, width, height);

    // Free memory if ImageBitmap was used
    if ("close" in img && typeof (img as ImageBitmap).close === "function") {
      (img as ImageBitmap).close();
    }

    // Attempt 1: Standard orientation on downscaled canvas
    const code1 = await decodeBarcodeFromCanvas(canvas);
    if (code1) return code1;

    // Attempt 2: 90-degree rotated orientation (for mobile EXIF portrait photos)
    const rotatedCanvas = rotateCanvas90(canvas);
    const code2 = await decodeBarcodeFromCanvas(rotatedCanvas);
    if (code2) return code2;

  } catch (err) {
    console.error("[BarcodeDecoder] Error decoding uploaded image:", err);
  }

  return null;
}
