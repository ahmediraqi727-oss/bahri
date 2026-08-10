import sharp from "sharp";
import { WatermarkConfig, WatermarkPosition } from "./types";
import { supabase } from "./supabase-client";
import * as fs from "fs";
import * as path from "path";

// استخدام خريطة آمنة لتخزين الشعار مؤقتاً في الذاكرة لتسريع المعالجة
const watermarkBufferCache = new Map<string, Buffer>();

/**
 * تحويل أي مصدر صورة (رابط خارجي، Base64، أو ملف محلي) إلى Buffer مع معالجة الأخطاء
 */
export async function urlToBuffer(input: string): Promise<Buffer> {
  if (!input || typeof input !== "string") {
    throw new Error("رابط أو مسار الصورة غير صالح");
  }

  // 1. التعامل مع صيغة Base64
  if (input.startsWith("data:")) {
    const base64Data = input.split(",")[1];
    if (!base64Data) throw new Error("سلسلة Base64 غير صالحة");
    return Buffer.from(base64Data, "base64");
  }

  // 2. التعامل مع الروابط الخارجية (HTTP / HTTPS)
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      const response = await fetch(input);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
      throw new Error(`فشل الجلب برمز استجابة: ${response.status}`);
    } catch (e) {
      console.warn(`فشل الجلب الخارجي للرابط (${input})، جارِ الارتداد للملف المحلي:`, e);
    }
  }

  // 3. التعامل مع المسارات المحلية كخيار أخير وآمن
  try {
    // تنظيف المسار لضمان عدم حدوث مشاكل في مسارات الـ OS
    const cleanPath = input.replace(/^[\/\\]/, "");
    const localPath = path.isAbsolute(input) 
      ? input 
      : path.join(process.cwd(), "public", cleanPath);

    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
  } catch (fsErr) {
    console.warn("خطأ في قراءة الملف المحلي:", fsErr);
  }

  throw new Error(`تعذر العثور على صورة الشعار أو تحميلها من المصدر: ${input}`);
}

/**
 * جلب شعار العلامة المائية مع كاش ذكي يعتمد على الرابط الفعلي لمنع التداخل
 */
async function getCachedWatermarkBuffer(watermarkUrl: string): Promise<Buffer> {
  const cacheKey = watermarkUrl || "watermark.png";
  
  if (watermarkBufferCache.has(cacheKey)) {
    return watermarkBufferCache.get(cacheKey)!;
  }
  
  const buffer = await urlToBuffer(cacheKey);
  watermarkBufferCache.set(cacheKey, buffer);
  return buffer;
}

/**
 * تطبيق العلامة المائية باحترافية ودقة عالية مع حسابات الأبعاد والشفافية
 */
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

  // جلب الشعار باستخدام الكاش الديناميكي المصحح
  const wmRawBuffer = await getCachedWatermarkBuffer(targetWmUrl);
  if (!wmRawBuffer || wmRawBuffer.length === 0) {
    const processedBuffer = await baseSharp.toBuffer();
    return { buffer: processedBuffer, format, width: baseWidth, height: baseHeight };
  }

  // حساب نسبة الحجم بناءً على إعدادات المستخدم مع وضع حدود آمنة
  const scalePercent = Math.min(Math.max(config.scale || 22, 5), 80);
  const targetWmW = Math.max(20, Math.round(baseWidth * (scalePercent / 100)));

  // تحضير الشعار وتغيير حجزه وضمان وجود قناة ألفا للشفافية
  const wmSharp = sharp(wmRawBuffer).resize({ width: targetWmW, fit: "inside" }).ensureAlpha();
  const wmResizedBuffer = await wmSharp.toBuffer();

  const wmMeta = await sharp(wmResizedBuffer).metadata();
  const wmW = wmMeta.width || targetWmW;
  const wmH = wmMeta.height || targetWmW;

  // التحكم بدرجة الشفافية (Opacity)
  const opacity = Math.min(Math.max(config.opacity ?? 90, 0), 100);
  let finalWmBuffer = wmResizedBuffer;

  if (opacity < 100) {
    const opacityFactor = opacity / 100;
    const maskSvg = `<svg width="${wmW}" height="${wmH}"><rect width="${wmW}" height="${wmH}" fill="white" fill-opacity="${opacityFactor}"/></svg>`;
    finalWmBuffer = await sharp(wmResizedBuffer)
      .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
      .toBuffer();
  }

  // حساب المواضع بدقة (Positions)
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
    case "custom": {
      const customX = config.customX ?? 10;
      const customY = config.customY ?? 10;
      left = Math.round((customX / 100) * baseWidth - wmW / 2);
      top = Math.round((customY / 100) * baseHeight - wmH / 2);
      break;
    }
  }

  // ضمان عدم خروج الشعار عن حدود الصورة الأصلية
  left = Math.max(0, Math.min(left, baseWidth - wmW));
  top = Math.max(0, Math.min(top, baseHeight - wmH));

  // دمج الشعار مع الصورة الأصلية
  const processedBuffer = await baseSharp
    .composite([{ input: finalWmBuffer, left, top }])
    .toBuffer();

  return { buffer: processedBuffer, format, width: baseWidth, height: baseHeight };
}

/**
 * معالجة وتوليد رابط Data URL مباشر مع تصحيح نوع الـ MimeType ديناميكياً
 */
export async function processAndUploadWatermarkImage(
  imageUrl: string,
  config: WatermarkConfig
): Promise<string> {
  const baseBuffer = await urlToBuffer(imageUrl);
  const { buffer, format } = await applyWatermarkToBuffer(baseBuffer, config);

  const base64Str = buffer.toString("base64");
  
  // معالجة ديناميكية صحيحة لصيغ الصور المتعددة
  const normalizedFormat = format === "jpg" ? "jpeg" : format;
  const mimeType = `image/${normalizedFormat}`;

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
