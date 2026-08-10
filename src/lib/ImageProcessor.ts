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

  // Handle Base64 Data URL
  if (input.startsWith("data:")) {
    const base64Data = input.split(",")[1];
    if (!base64Data) throw new Error("سلسلة Base64 غير صالحة");
    return Buffer.from(base64Data, "base64");
  }

  // Handle Standard HTTP / HTTPS URL
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`فشل تحميل الصورة من الرابط: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Gets cached watermark buffer or downloads and caches it
 */
async function getCachedWatermarkBuffer(watermarkUrl: string): Promise<Buffer> {
  if (watermarkBufferCache.has(watermarkUrl)) {
    return watermarkBufferCache.get(watermarkUrl)!;
  }

  const buffer = await urlToBuffer(watermarkUrl);
  watermarkBufferCache.set(watermarkUrl, buffer);
  return buffer;
}

/**
 * Process a single image buffer by compositing the watermark using Sharp.
 * Respects relative aspect ratio, opacity, and custom percentages (0-100%).
 */
export async function applyWatermarkToBuffer(
  baseImageBuffer: Buffer,
  config: WatermarkConfig
): Promise<{ buffer: Buffer; format: string; width: number; height: number }> {
  if (!config.watermarkUrl) {
    throw new Error("لم يتم تحديد رابط شعار العلامة المائية");
  }

  // 1. Fetch & Metadata for Base Product Image
  const baseSharp = sharp(baseImageBuffer);
  const baseMeta = await baseSharp.metadata();

  const baseWidth = baseMeta.width || 800;
  const baseHeight = baseMeta.height || 800;
  const format = baseMeta.format || "jpeg";

  // 2. Fetch Watermark Logo Buffer (Cached in Server Memory)
  const wmRawBuffer = await getCachedWatermarkBuffer(config.watermarkUrl);

  // 3. Calculate target watermark width based on scale percentage (5% to 80%)
  const scalePercent = Math.min(Math.max(config.scale || 20, 5), 80);
  const targetWmW = Math.max(20, Math.round(baseWidth * (scalePercent / 100)));

  // Resize watermark logo keeping aspect ratio
  let wmSharp = sharp(wmRawBuffer).resize({ width: targetWmW, fit: "inside" }).ensureAlpha();
  let wmResizedBuffer = await wmSharp.toBuffer();

  const wmMeta = await sharp(wmResizedBuffer).metadata();
  const wmW = wmMeta.width || targetWmW;
  const wmH = wmMeta.height || targetWmW;

  // 4. Apply Opacity adjustment using dest-in SVG mask if opacity < 100
  const opacity = Math.min(Math.max(config.opacity ?? 80, 0), 100);
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

  const pos: WatermarkPosition = config.position || "bottom-right";

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
        const customX = config.customX ?? 85;
        const customY = config.customY ?? 85;
        // Center the watermark on the custom percentage coordinates
        left = Math.round((customX / 100) * baseWidth - wmW / 2);
        top = Math.round((customY / 100) * baseHeight - wmH / 2);
      }
      break;
  }

  // Clamp coordinates within image boundaries
  left = Math.max(0, Math.min(left, baseWidth - wmW));
  top = Math.max(0, Math.min(top, baseHeight - wmH));

  // 6. Perform Overlay Compositing with Sharp
  const processedBuffer = await sharp(baseImageBuffer)
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
 * Retains original image URL intact.
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

  const { data, error } = await supabase.storage.from(bucket).upload(fileName, buffer, {
    contentType: `image/${format}`,
    upsert: true,
    cacheControl: "3600",
  });

  if (error) {
    console.error("Error uploading watermarked image to Supabase Storage:", error);
    throw new Error(`فشل رفع الصورة المعالجة إلى Storage: ${error.message}`);
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  if (!publicData?.publicUrl) {
    throw new Error("تعذّر الحصول على رابط الصورة المعالجة العام");
  }

  return publicData.publicUrl;
}
