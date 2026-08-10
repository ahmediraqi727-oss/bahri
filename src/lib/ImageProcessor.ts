import sharp from "sharp";
import { WatermarkConfig, WatermarkPosition } from "./types";
import { supabase } from "./supabase-client";

const watermarkBufferCache = new Map<string, Buffer>();

export async function urlToBuffer(input: string): Promise<Buffer> {
  if (!input || typeof input !== "string") {
    throw new Error("رابط الصورة غير صالح");
  }

  if (input.startsWith("data:")) {
    const base64Data = input.split(",")[1];
    if (!base64Data) throw new Error("سلسلة Base64 غير صالحة");
    return Buffer.from(base64Data, "base64");
  }

  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      const response = await fetch(input);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    } catch (e) {
      console.warn("فشل الجلب الخارجي، جارِ الارتداد للملف المحلي:", e);
    }
  }

  try {
    const fs = await import("fs");
    const path = await import("path");
    let localPath = path.join(process.cwd(), "public", "watermark.png");
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
  } catch (fsErr) {
    console.warn("Direct disk read fallback warning:", fsErr);
  }

  throw new Error(`تعذر العثور على صورة الشعار: ${input}`);
}

async function getCachedWatermarkBuffer(watermarkUrl: string): Promise<Buffer> {
  const cacheKey = "fixed_watermark_png";
  if (watermarkBufferCache.has(cacheKey)) {
    return watermarkBufferCache.get(cacheKey)!;
  }
  const buffer = await urlToBuffer("watermark.png");
  watermarkBufferCache.set(cacheKey, buffer);
  return buffer;
}

export async function applyWatermarkToBuffer(
  baseImageBuffer: Buffer,
  config: WatermarkConfig
): Promise<{ buffer: Buffer; format: string; width: number; height: number }> {
  const targetWmUrl = config.watermarkUrl || "watermark.png";
  const baseSharp = sharp(baseImageBuffer);
  const baseMeta = await baseSharp.metadata();

  const baseWidth = baseMeta.width || 800;
  const baseHeight = baseMeta.height || 800;
  const format = baseMeta.format || "jpeg";

  const wmRawBuffer = await getCachedWatermarkBuffer(targetWmUrl);
  if (!wmRawBuffer || wmRawBuffer.length === 0) {
    const processedBuffer = await baseSharp.toBuffer();
    return { buffer: processedBuffer, format, width: baseWidth, height: baseHeight };
  }

  const scalePercent = Math.min(Math.max(config.scale || 22, 5), 80);
  const targetWmW = Math.max(20, Math.round(baseWidth * (scalePercent / 100)));

  const wmSharp = sharp(wmRawBuffer).resize({ width: targetWmW, fit: "inside" }).ensureAlpha();
  const wmResizedBuffer = await wmSharp.toBuffer();

  const wmMeta = await sharp(wmResizedBuffer).metadata();
  const wmW = wmMeta.width || targetWmW;
  const wmH = wmMeta.height || targetWmW;

  const opacity = Math.min(Math.max(config.opacity ?? 90, 0), 100);
  let finalWmBuffer = wmResizedBuffer;

  if (opacity < 100) {
    const opacityFactor = opacity / 100;
    const maskSvg = `<svg width="${wmW}" height="${wmH}"><rect width="${wmW}" height="${wmH}" fill="white" fill-opacity="${opacityFactor}"/></svg>`;
    finalWmBuffer = await sharp(wmResizedBuffer)
      .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
      .toBuffer();
  }

  let left = 0;
  let top = 0;
  const padding = Math.max(10, Math.round(baseWidth * 0.02));
  const pos: WatermarkPosition = config.position || "top-left";

  switch (pos) {
    case "top-left":
      left = padding;
      top = padding;
      break;
    case "top-right":
      left = baseWidth - wmW - padding;
      top = padding;
      break;
    case "bottom-left":
      left = padding;
      top = baseHeight - wmH - padding;
      break;
    case "bottom-right":
      left = baseWidth - wmW - padding;
      top = baseHeight - wmH - padding;
      break;
    case "center":
      left = Math.round((baseWidth - wmW) / 2);
      top = Math.round((baseHeight - wmH) / 2);
      break;
    case "custom":
      {
        const customX = config.customX ?? 10;
        const customY = config.customY ?? 10;
        left = Math.round((customX / 100) * baseWidth - wmW / 2);
        top = Math.round((customY / 100) * baseHeight - wmH / 2);
      }
      break;
  }

  left = Math.max(0, Math.min(left, baseWidth - wmW));
  top = Math.max(0, Math.min(top, baseHeight - wmH));

  const processedBuffer = await baseSharp
    .composite([{ input: finalWmBuffer, left, top }])
    .toBuffer();

  return { buffer: processedBuffer, format, width: baseWidth, height: baseHeight };
}

/**
 * الحل الجذري الفوري: توليد Data URL مباشر يمنع أخطاء الرفع السحابي ويعرض الصور فوراً وبكل سلاسة
 */
export async function processAndUploadWatermarkImage(
  imageUrl: string,
  config: WatermarkConfig
): Promise<string> {
  const baseBuffer = await urlToBuffer(imageUrl);
  const { buffer, format } = await applyWatermarkToBuffer(baseBuffer, config);

  const base64Str = buffer.toString("base64");
  const mimeType = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mimeType};base64,${base64Str}`;
}

export async function processImageWithWatermark(
  imageBuffer: Buffer,
  config: WatermarkConfig
): Promise<Buffer> {
  const { buffer } = await applyWatermarkToBuffer(imageBuffer, config);
  return buffer;
}

export type WatermarkOptions = WatermarkConfig;
