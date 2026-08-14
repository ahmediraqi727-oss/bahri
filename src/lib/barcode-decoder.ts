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
 * Decodes barcode or QR code from a canvas using a 4-pass contrast & binarization pipeline.
 */
export async function decodeBarcodeFromCanvas(
  sourceCanvas: HTMLCanvasElement
): Promise<string | null> {
  if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) return null;

  // Pass 1: Raw canvas decode with ZXing MultiFormatReader
  try {
    const luminanceSource = new HTMLCanvasElementLuminanceSource(sourceCanvas);
    const binarizer = new HybridBinarizer(luminanceSource);
    const bitmap = new BinaryBitmap(binarizer);
    const result = zxingReader.decode(bitmap);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Continue to Pass 1.5
  }

  // Pass 1.5: Native BarcodeDetector API if available
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      // @ts-expect-error — BarcodeDetector API
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e", "data_matrix"],
      });
      const detected = await detector.detect(sourceCanvas);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        return detected[0].rawValue;
      }
    } catch {
      // Continue to Pass 2
    }
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
