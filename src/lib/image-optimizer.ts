"use client";

import { supabase } from "./supabase-client";

export interface ImageOptimizationOptions {
  /** أقصى بعد (عرض أو ارتفاع) للصورة الرئيسية مع الحفاظ على الأبعاد الأصلية */
  maxMainDimension?: number;
  /** جودة ضغط WebP للصورة الرئيسية (0 إلى 1) */
  mainQuality?: number;
  /** أبعاد المصغرة المربعة (مثلاً 200x200) */
  thumbnailSize?: number;
  /** جودة ضغط WebP للمصغرة المربعة (0 إلى 1) */
  thumbnailQuality?: number;
  /** اسم حاوية التخزين السحابي في Supabase */
  bucket?: string;
}

export interface OptimizedImageResult {
  /** رابط الصورة الرئيسية النهائي (سحابي أو Data URL مضغوط بصيغة WebP) */
  mainUrl: string;
  /** رابط الصورة المصغرة المربعة 200x200 (سحابي أو Data URL مضغوط بصيغة WebP) */
  thumbnailUrl: string;
  /** نسخة Data URL مصغرة جداً (24x24) للتمويه الفوري (Blur-Up) عند ضعف الإنترنت */
  blurDataUrl: string;
  /** النسخة المحلية المضغوطة للصورة الرئيسية */
  mainDataUrl: string;
  /** النسخة المحلية المضغوطة للمصغرة 200x200 */
  thumbnailDataUrl: string;
  /** الحجم الأصلي بالبايت */
  originalSize: number;
  /** حجم الصورة الرئيسية بعد الضغط بالبايت */
  optimizedSize: number;
  /** حجم المصغرة 200x200 بالبايت */
  thumbnailSize: number;
  /** نسبة التوفير المئوية (مثلاً 88%) */
  savingsPercent: number;
  /** العرض النهائي للصورة الرئيسية */
  width: number;
  /** الارتفاع النهائي للصورة الرئيسية */
  height: number;
  /** الصيغة المستخدمة (WebP أو JPEG) */
  format: "webp" | "jpeg";
}

const THUMB_CACHE_KEY = "ahmed_bahri_product_thumbs_v1";
const memoryThumbCache = new Map<string, { thumbnail: string; blur?: string }>();

function loadLocalThumbCache(): Record<string, { thumbnail: string; blur?: string }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(THUMB_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, { thumbnail: string; blur?: string }>;
  } catch {
    return {};
  }
}

export function cacheProductThumbnail(
  key: string,
  thumbnail: string,
  blur?: string
): void {
  if (!key || !thumbnail) return;
  memoryThumbCache.set(key, { thumbnail, blur });
  if (typeof window === "undefined") return;
  try {
    const current = loadLocalThumbCache();
    const keys = Object.keys(current);
    // الحفاظ على سقف آمن للذاكرة المحلية (أحدث 250 مصغرة)
    if (keys.length > 250) {
      delete current[keys[0]];
    }
    current[key] = { thumbnail, blur };
    localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(current));
  } catch {
    /* ignore storage quota */
  }
}

export function getCachedProductThumbnail(
  productId?: string | null,
  imageUrl?: string | null
): { thumbnail?: string; blur?: string } | null {
  if (productId && memoryThumbCache.has(productId)) {
    return memoryThumbCache.get(productId)!;
  }
  if (imageUrl && imageUrl.length < 300 && memoryThumbCache.has(imageUrl)) {
    return memoryThumbCache.get(imageUrl)!;
  }
  if (typeof window === "undefined") return null;
  const store = loadLocalThumbCache();
  if (productId && store[productId]) {
    memoryThumbCache.set(productId, store[productId]);
    return store[productId];
  }
  if (imageUrl && imageUrl.length < 300 && store[imageUrl]) {
    memoryThumbCache.set(imageUrl, store[imageUrl]);
    return store[imageUrl];
  }
  return null;
}

/**
 * تحويل Canvas إلى Data URL و Blob بصيغة WebP الحديثة مع تراجع تلقائي إلى JPEG
 */
async function canvasToOptimizedOutput(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<{ dataUrl: string; blob: Blob; format: "webp" | "jpeg" }> {
  let dataUrl = canvas.toDataURL("image/webp", quality);
  let format: "webp" | "jpeg" = "webp";

  // التحقق من دعم المتصفح لصيغة WebP
  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    format = "jpeg";
  }

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          // Fallback from dataUrl
          const byteString = atob(dataUrl.split(",")[1] || "");
          const mimeString = dataUrl.split(",")[0]?.split(":")[1]?.split(";")[0] || "image/webp";
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          resolve(new Blob([ab], { type: mimeString }));
        }
      },
      format === "webp" ? "image/webp" : "image/jpeg",
      quality
    );
  });

  return { dataUrl, blob, format };
}

/**
 * تحميل ملف صورة داخل عنصر HTMLImageElement بأمان
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

/**
 * محرك ضغط الصور وتوليد المصغرات الفوري في المتصفح:
 * 1) يحافظ على الأبعاد الأصلية للصورة الرئيسية (بحد أقصى 800px) بصيغة WebP عالية الوضوح.
 * 2) يولد نسخة مصغرة مربعة متناسقة 200x200 بقص مركزي ذكي (Center Crop) للقوائم والجداول.
 * 3) يولد معاينة ضبابية فورية (24x24) للعرض اللحظي عند ضعف الإنترنت.
 */
export async function optimizeProductImage(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<
  Omit<OptimizedImageResult, "mainUrl" | "thumbnailUrl"> & {
    mainBlob: Blob;
    thumbnailBlob: Blob;
  }
> {
  const maxMainDim = options.maxMainDimension ?? 800;
  const mainQuality = options.mainQuality ?? 0.8;
  const thumbSize = options.thumbnailSize ?? 200;
  const thumbQuality = options.thumbnailQuality ?? 0.76;

  const img = await loadImageFromFile(file);
  const origW = img.naturalWidth || img.width || 800;
  const origH = img.naturalHeight || img.height || 800;

  // 1. حساب أبعاد الصورة الرئيسية مع الحفاظ التام على النسبة الأصلية (Aspect Ratio)
  let targetW = origW;
  let targetH = origH;
  if (targetW > maxMainDim || targetH > maxMainDim) {
    if (targetW >= targetH) {
      targetH = Math.max(1, Math.round((targetH * maxMainDim) / targetW));
      targetW = maxMainDim;
    } else {
      targetW = Math.max(1, Math.round((targetW * maxMainDim) / targetH));
      targetH = maxMainDim;
    }
  }

  const mainCanvas = document.createElement("canvas");
  mainCanvas.width = targetW;
  mainCanvas.height = targetH;
  const mainCtx = mainCanvas.getContext("2d");
  if (mainCtx) {
    mainCtx.imageSmoothingEnabled = true;
    mainCtx.imageSmoothingQuality = "high";
    mainCtx.drawImage(img, 0, 0, targetW, targetH);
  }

  const mainOut = await canvasToOptimizedOutput(mainCanvas, mainQuality);

  // 2. توليد المصغرة المربعة المتناسقة 200x200 (Smart Center Crop)
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = thumbSize;
  thumbCanvas.height = thumbSize;
  const thumbCtx = thumbCanvas.getContext("2d");
  if (thumbCtx) {
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = "high";
    const minSide = Math.min(origW, origH);
    const sx = Math.max(0, Math.round((origW - minSide) / 2));
    const sy = Math.max(0, Math.round((origH - minSide) / 2));
    thumbCtx.drawImage(img, sx, sy, minSide, minSide, 0, 0, thumbSize, thumbSize);
  }

  const thumbOut = await canvasToOptimizedOutput(thumbCanvas, thumbQuality);

  // 3. توليد معاينة ضبابية فائقة الخفة (24x24) للتحميل الفوري عند ضعف الشبكة
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = 24;
  blurCanvas.height = 24;
  const blurCtx = blurCanvas.getContext("2d");
  if (blurCtx) {
    blurCtx.imageSmoothingEnabled = true;
    blurCtx.drawImage(thumbCanvas, 0, 0, 24, 24);
  }
  const blurDataUrl = blurCanvas.toDataURL("image/webp", 0.5);

  const originalSize = file.size || mainOut.blob.size;
  const optimizedSize = mainOut.blob.size;
  const thumbnailByteSize = thumbOut.blob.size;
  const savingsPercent =
    originalSize > optimizedSize
      ? Math.min(99, Math.max(1, Math.round(((originalSize - optimizedSize) / originalSize) * 100)))
      : 0;

  return {
    mainBlob: mainOut.blob,
    thumbnailBlob: thumbOut.blob,
    mainDataUrl: mainOut.dataUrl,
    thumbnailDataUrl: thumbOut.dataUrl,
    blurDataUrl,
    originalSize,
    optimizedSize,
    thumbnailSize: thumbnailByteSize,
    savingsPercent,
    width: targetW,
    height: targetH,
    format: mainOut.format,
  };
}

/**
 * ضغط الصورة وتوليد المصغرة في المتصفح ثم محاولة الرفع المتوازي إلى Supabase Storage
 * مع تراجع سلس وآمن إلى Data URL المضغوط بصيغة WebP في حال عدم توفر الحاوية السحابية.
 */
export async function processAndUploadProductImage(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<OptimizedImageResult> {
  const bucket = options.bucket || "product-images";
  const optimized = await optimizeProductImage(file, options);

  const ext = optimized.format === "webp" ? "webp" : "jpg";
  const contentType = optimized.format === "webp" ? "image/webp" : "image/jpeg";
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const mainPath = `products/main/${uniqueId}.${ext}`;
  const thumbPath = `products/thumbs/${uniqueId}_200x200.${ext}`;

  let finalMainUrl = optimized.mainDataUrl;
  let finalThumbUrl = optimized.thumbnailDataUrl;

  try {
    const [mainUpload, thumbUpload] = await Promise.all([
      supabase.storage.from(bucket).upload(mainPath, optimized.mainBlob, {
        upsert: true,
        contentType,
        cacheControl: "31536000",
      }),
      supabase.storage.from(bucket).upload(thumbPath, optimized.thumbnailBlob, {
        upsert: true,
        contentType,
        cacheControl: "31536000",
      }),
    ]);

    if (!mainUpload.error && mainUpload.data) {
      const { data: pubMain } = supabase.storage.from(bucket).getPublicUrl(mainPath);
      if (pubMain?.publicUrl) {
        finalMainUrl = pubMain.publicUrl;
      }
    }

    if (!thumbUpload.error && thumbUpload.data) {
      const { data: pubThumb } = supabase.storage.from(bucket).getPublicUrl(thumbPath);
      if (pubThumb?.publicUrl) {
        finalThumbUrl = pubThumb.publicUrl;
      }
    }
  } catch {
    // في حال عدم وجود حاوية التخزين السحابية أو ضعف الاتصال، نعتمد النسخة المضغوطة بصيغة WebP مباشرةً
  }

  // تخزين المصغرة في الذاكرة المحلية لربطها بالصورة الرئيسية فوراً
  if (finalMainUrl.length < 300) {
    cacheProductThumbnail(finalMainUrl, finalThumbUrl, optimized.blurDataUrl);
  }

  return {
    mainUrl: finalMainUrl,
    thumbnailUrl: finalThumbUrl,
    blurDataUrl: optimized.blurDataUrl,
    mainDataUrl: optimized.mainDataUrl,
    thumbnailDataUrl: optimized.thumbnailDataUrl,
    originalSize: optimized.originalSize,
    optimizedSize: optimized.optimizedSize,
    thumbnailSize: optimized.thumbnailSize,
    savingsPercent: optimized.savingsPercent,
    width: optimized.width,
    height: optimized.height,
    format: optimized.format,
  };
}

/**
 * تنسيق حجم الملف بالـ KB أو MB للعرض في واجهة المستخدم
 */
export function formatByteSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
