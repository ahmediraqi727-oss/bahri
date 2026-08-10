import sharp from "sharp";
import { WatermarkConfig, WatermarkPosition } from "./types";
import { supabase } from "./supabase-client";

// Module-level Server Memory Cache for Watermark Logo Buffer
const watermarkBufferCache = new Map<string, Buffer>();

/**
 * Utility to fetch an image URL or parse Data URL into a Node.js Buffer
 */
export async function urlToBuffer(input: string): Promise<Buffer> {
  if (!input || typeof input !== "string") {
    throw new Error("رابط الصورة غير صالح");
  }

  // 1. Handle Base64 Data URL
  if (input.startsWith("data:")) {
    const base64Data = input.split(",")[1];
    if (!base64Data) throw new Error("سلسلة Base64 غير صالحة");
    return Buffer.from(base64Data, "base64");
  }

  // 2. Handle absolute URLs (HTTP / HTTPS)
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`فشل تحميل الصورة من الرابط [${response.status}]: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // 3. Handle relative URLs & Vercel environment safe fallback
  let cleanPath = input.replace(/^\//, "").split("?")[0];
  if (!cleanPath) cleanPath = "watermark.png";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ahmed-bahri.vercel.app";
  const absoluteUrl = `${siteUrl.replace(/\/$/, "")}/${cleanPath}`;

  try {
    const response = await fetch(absoluteUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch (netErr) {
    console.warn("فشل الجلب عبر الشبكة للرابط النسبي، جاري محاولة التخزين المحلي:", netErr);
  }

  // Fallback to local disk read only if running in a node environment with fs support
  try {
    const fs = await import("fs");
    const path = await import("path");
    const localPath = path.join(process.cwd(), "public", cleanPath);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
    // Fallback default watermark
    const defaultPath = path.join(process.cwd(), "public", "watermark.png");
    if (fs.existsSync(defaultPath)) {
      return fs.readFileSync(defaultPath);
    }
  } catch (fsErr) {
    console.warn("Direct disk read fallback warning:", fsErr);
  }

  throw new Error(`تعذر العثور على صورة الشعار أو تحميلها نهائياً من المسار: ${input}`);
}

/**
 * Gets cached watermark buffer or downloads and caches it with bulletproof fallbacks
 */
async function getCachedWatermarkBuffer(watermarkUrl: string): Promise<Buffer> {
  const cacheKey = watermarkUrl || "watermark.png";
  if (watermarkBufferCache.has(cacheKey)) {
    return watermarkBufferCache.get(cacheKey)!;
  }

  try {
    const buffer = await urlToBuffer(cacheKey);
    watermarkBufferCache.set(cacheKey, buffer);
    return buffer;
  } catch (err) {
    console.warn(`Watermark logo fetch error for ${watermarkUrl}, attempting fallback to /watermark.png:`, err);
    const fallbackBuffer = await urlToBuffer("watermark.png");
    watermarkBufferCache.set(cacheKey, fallbackBuffer);
    return fallbackBuffer;
  }
}

/**
 * Process a single image buffer by compositing the watermark using Sharp.
 * Respects relative aspect ratio, opacity, and responsive top-left positioning.
 */
export async function applyWatermarkToBuffer(
  baseImageBuffer: Buffer,
  config: WatermarkConfig
): Promise<{ buffer: Buffer; format: string; width: number; height: number }> {
  const targetWmUrl = config.watermarkUrl || "watermark.png";

  // 1. Fetch & Metadata for Base Product Image
  const baseSharp = sharp(baseImageBuffer);
  const baseMeta = await baseSharp.metadata();

  const baseWidth = baseMeta.width || 800;
  const baseHeight = baseMeta.height || 800;
  const format = baseMeta.format || "jpeg";

  // 2. Fetch Watermark Logo Buffer (Cached in Server Memory)
  const wmRawBuffer = await getCachedWatermarkBuffer(targetWmUrl);

  // 3. Calculate target watermark width based on scale percentage (5% to 80%)
  const scalePercent = Math.min(Math.max(config.scale || 22, 5), 80);
  const targetWmW = Math.max(20, Math.round(baseWidth * (scalePercent / 100)));

  // Resize watermark logo keeping aspect ratio
  const wmSharp = sharp(wmRawBuffer).resize({ width: targetWmW, fit: "inside" }).ensureAlpha();
  const wmResizedBuffer = await wmSharp.toBuffer();

  const wmMeta = await sharp(wmResizedBuffer).metadata();
  const wmW = wmMeta.width || targetWmW;
  const wmH = wmMeta.height || targetWmW;

  // 4. Apply Opacity adjustment using dest-in SVG mask if opacity < 100
  const opacity = Math.min(Math.max(config.opacity ?? 90, 0), 100);
  let finalWmBuffer = wmResizedBuffer;

  if (opacity < 100) {
    const opacityFactor = opacity / 100;
    const maskSvg = `<svg width="${wmW}" height="${wmH}"><rect width="${wmW}" height="${wmH}" fill="white" fill-opacity="${opacityFactor}"/></svg>`;
    
    finalWmBuffer = await sharp(wmResizedBuffer)
      .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
      .toBuffer();
  }

  // 5. Calculate Exact Responsive Position (X, Y) relative to Original Image Dimensions
  let left = 0;
  let top = 0;
  const padding = Math.max(10, Math.round(baseWidth * 0.02)); // 2% padding

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

  // Clamp coordinates within image boundaries
  left = Math.max(0, Math.min(left, baseWidth - wmW));
  top = Math.max(0, Math.min(top, baseHeight - wmH));

  // 6. Perform Overlay Compositing directly using pre-opened baseSharp object
  const processedBuffer = await baseSharp
    .composite([{ input: finalWmBuffer, left, top }])
    .toBuffer();

  return {
    buffer: processedBuffer,
    format,
    width: baseWidth,
    height: baseHeight,
  };
}

/**
 * Processes base image URL and uploads the watermarked version to Supabase Storage (/products/watermarked/).
 */
export async function processAndUploadWatermarkImage(
  imageUrl: string,
  config: WatermarkConfig
): Promise<string> {
  const baseBuffer = await urlToBuffer(imageUrl);
  const { buffer, format } = await applyWatermarkToBuffer(baseBuffer, config);

  const bucket = config.targetBucket || "watermarked-products";
  const fileExt = format === "jpeg" ? "jpg" : format;
  const fileName = `products/watermarked/wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

  // 1. Try Primary Bucket Upload
  try {
    const { data, error } = await supabase.storage.from(bucket).upload(fileName, buffer, {
      contentType: `image/${format}`,
      upsert: true,
      cacheControl: "3600",
    });

    if (!error && data) {
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      if (publicData?.publicUrl) {
        return publicData.publicUrl;
      }
    }
  } catch (primaryErr) {
    console.warn("Primary storage bucket exception:", primaryErr);
  }

  // 2. Try Secondary Bucket Upload ('products')
  try {
    const { data: fbData, error: fbError } = await supabase.storage.from("products").upload(fileName, buffer, {
      contentType: `image/${format}`,
      upsert: true,
      cacheControl: "3600",
    });
    if (!fbError && fbData) {
      const { data: fbPublicData } = supabase.storage.from("products").getPublicUrl(fileName);
      if (fbPublicData?.publicUrl) {
        return fbPublicData.publicUrl;
      }
    }
  } catch (secErr) {
    console.warn("Secondary storage bucket exception:", secErr);
  }

  // 3. Ultra-Safe Fallback
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
