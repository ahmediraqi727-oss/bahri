import { NextRequest, NextResponse } from "next/server";
import { processAndUploadWatermarkImage, processImageWithWatermark } from "@/lib/ImageProcessor";
import { WatermarkConfig, WatermarkOptions } from "@/lib/types";
import { supabase } from "@/lib/supabase-client";
import { createClient } from "@supabase/supabase-js";

// Use Supabase Service Role Key for full administrative storage and DB access if configured
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

interface BulkItem {
  id: string;
  image: string;
  originalImageUrl?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productIds, items, options, watermarkConfig, revertToOriginal } = body as {
      productIds?: string[];
      items?: BulkItem[];
      options?: WatermarkOptions;
      watermarkConfig?: WatermarkConfig;
      revertToOriginal?: boolean;
    };

    const effectiveConfig = options || watermarkConfig;

    // Handle productIds mode (fetch products from Supabase DB dynamically)
    let targetItems: BulkItem[] = [];

    if (Array.isArray(productIds) && productIds.length > 0) {
      const dbClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdmin : supabase;
      const { data: dbProducts, error: fetchError } = await dbClient
        .from("products")
        .select("id, name, image, original_image_url")
        .in("id", productIds);

      if (fetchError) {
        return NextResponse.json(
          { error: `فشل جلب المنتجات من القاعدة: ${fetchError.message}` },
          { status: 400 }
        );
      }

      if (dbProducts) {
        targetItems = dbProducts.map((p) => ({
          id: p.id,
          image: p.image || "",
          originalImageUrl: p.original_image_url || "",
        }));
      }
    } else if (Array.isArray(items) && items.length > 0) {
      targetItems = items;
    }

    if (targetItems.length === 0) {
      return NextResponse.json({ error: "لم يتم تحديد أي منتجات للمعالجة." }, { status: 400 });
    }

    if (!revertToOriginal && (!effectiveConfig || !effectiveConfig.watermarkUrl)) {
      return NextResponse.json({ error: "رابط الشعار (Watermark) غير متوفر في الإعدادات." }, { status: 400 });
    }

    const results: Array<{ id: string; success: boolean; image?: string; originalImageUrl?: string; error?: string }> = [];
    let processedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // ── Revert to Original Mode ─────────────────────────────────────────────
    if (revertToOriginal) {
      const dbClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdmin : supabase;
      for (const item of targetItems) {
        try {
          const originalUrl = item.originalImageUrl || item.image;
          if (originalUrl) {
            await dbClient
              .from("products")
              .update({ image: originalUrl, updated_at: new Date().toISOString() })
              .eq("id", item.id);

            results.push({ id: item.id, success: true, image: originalUrl, originalImageUrl: originalUrl });
            processedCount++;
          } else {
            results.push({ id: item.id, success: false, error: "لا تتوفر صورة أصلية للمنتج" });
            failedCount++;
          }
        } catch (err: any) {
          results.push({ id: item.id, success: false, error: err.message });
          failedCount++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `تمت استعادة ${processedCount} منتج بنجاح، وفشل ${failedCount}.`,
        processedCount,
        failedCount,
        errorsCount: failedCount,
        results,
      });
    }

    // ── Bulk Watermark Processing Mode (Chunks of 10 with Retry Logic & Promise.all) ───────────
    const CHUNK_SIZE = 10;
    for (let i = 0; i < targetItems.length; i += CHUNK_SIZE) {
      const chunk = targetItems.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (item) => {
          const sourceUrl = item.originalImageUrl && item.originalImageUrl.trim() ? item.originalImageUrl.trim() : item.image;
          if (!sourceUrl || !sourceUrl.trim()) {
            failedCount++;
            results.push({ id: item.id, success: false, error: "لا تتوفر صورة للمنتج" });
            return;
          }

          let newWatermarkedUrl: string | null = null;
          let lastError: any = null;
          let attempts = 0;
          const maxRetries = 2; // Smart Retry 2x

          while (!newWatermarkedUrl && attempts < maxRetries) {
            attempts++;
            try {
              newWatermarkedUrl = await processAndUploadWatermarkImage(sourceUrl, effectiveConfig!);
            } catch (err: any) {
              lastError = err;
              console.warn(`[Watermark Bulk Retry] Attempt ${attempts} failed for product ${item.id}:`, err?.message);
              await new Promise((res) => setTimeout(res, 400));
            }
          }

          if (newWatermarkedUrl) {
            const originalToSave = sourceUrl;
            const dbClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdmin : supabase;

            const { error: updateError } = await dbClient
              .from("products")
              .update({
                image: newWatermarkedUrl,
                original_image_url: originalToSave,
                updated_at: new Date().toISOString(),
              })
              .eq("id", item.id);

            if (updateError) {
              console.warn(`Supabase product update warning for ${item.id}:`, updateError.message);
            }

            results.push({
              id: item.id,
              success: true,
              image: newWatermarkedUrl,
              originalImageUrl: originalToSave,
            });
            processedCount++;
          } else {
            const errMsg = `فشل معالجة المنتج ID: ${item.id} بعد ${maxRetries} محاولات (${lastError?.message || "خطأ غير معروف"})`;
            errors.push(errMsg);
            results.push({ id: item.id, success: false, error: errMsg });
            failedCount++;
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      message: `تمت معالجة ${processedCount} منتج بنجاح، وفشل ${failedCount}.`,
      processedCount,
      failedCount,
      errorsCount: failedCount,
      errors,
      results,
    });
  } catch (error: any) {
    console.error("خطأ في معالجة العلامة المائية الجماعية:", error);
    return NextResponse.json(
      { error: error?.message || "حدث خطأ غير متوقع في الخادم." },
      { status: 500 }
    );
  }
}
