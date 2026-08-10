import { NextRequest, NextResponse } from "next/server";
import { processAndUploadWatermarkImage } from "@/lib/ImageProcessor";
import { WatermarkConfig } from "@/lib/types";
import { supabase } from "@/lib/supabase-client";

interface BulkItem {
  id: string;
  image: string;
  originalImageUrl?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, watermarkConfig, revertToOriginal } = body as {
      items: BulkItem[];
      watermarkConfig: WatermarkConfig;
      revertToOriginal?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "قائمة المنتجات فارغة" }, { status: 400 });
    }

    const results: Array<{ id: string; success: boolean; image?: string; originalImageUrl?: string; error?: string }> = [];
    let processedCount = 0;
    let errorsCount = 0;

    // ── Revert to Original Mode ─────────────────────────────────────────────
    if (revertToOriginal) {
      for (const item of items) {
        try {
          const originalUrl = item.originalImageUrl || item.image;
          if (originalUrl) {
            await supabase
              .from("products")
              .update({ image: originalUrl, updated_at: new Date().toISOString() })
              .eq("id", item.id);

            results.push({ id: item.id, success: true, image: originalUrl, originalImageUrl: originalUrl });
            processedCount++;
          } else {
            results.push({ id: item.id, success: false, error: "لا تتوفر صورة أصلية للمنتج" });
            errorsCount++;
          }
        } catch (err: any) {
          results.push({ id: item.id, success: false, error: err.message });
          errorsCount++;
        }
      }

      return NextResponse.json({ success: true, processedCount, errorsCount, results });
    }

    // ── Bulk Watermark Processing Mode (Chunked with Retry Logic) ───────────
    for (const item of items) {
      // Determine the source image URL (prefer existing original_image_url if present)
      const sourceUrl = item.originalImageUrl && item.originalImageUrl.trim() ? item.originalImageUrl.trim() : item.image;

      if (!sourceUrl || !sourceUrl.trim()) {
        results.push({ id: item.id, success: false, error: "لا تتوفر صورة للمنتج" });
        errorsCount++;
        continue;
      }

      let newWatermarkedUrl: string | null = null;
      let lastError: any = null;

      // Retry loop (up to 2 retries per image for fault tolerance)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          newWatermarkedUrl = await processAndUploadWatermarkImage(sourceUrl, watermarkConfig);
          if (newWatermarkedUrl) break; // Success!
        } catch (err: any) {
          lastError = err;
          console.warn(`[Watermark Bulk Retry] Attempt ${attempt} failed for product ${item.id}:`, err?.message);
          // Short pause before retry
          await new Promise((res) => setTimeout(res, 500));
        }
      }

      if (newWatermarkedUrl) {
        // Preserve original_image_url and update image with watermarked URL
        const originalToSave = sourceUrl;

        const { error: dbError } = await supabase
          .from("products")
          .update({
            image: newWatermarkedUrl,
            original_image_url: originalToSave,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        if (dbError) {
          console.warn(`Supabase product update warning for ${item.id}:`, dbError.message);
        }

        results.push({
          id: item.id,
          success: true,
          image: newWatermarkedUrl,
          originalImageUrl: originalToSave,
        });
        processedCount++;
      } else {
        results.push({
          id: item.id,
          success: false,
          error: lastError?.message || "فشلت معالجة الصورة بعد محاولتين",
        });
        errorsCount++;
      }
    }

    return NextResponse.json({
      success: true,
      processedCount,
      errorsCount,
      results,
    });
  } catch (error: any) {
    console.error("Bulk Watermark API error:", error);
    return NextResponse.json(
      { error: error?.message || "حدث خطأ غير متوقع أثناء معالجة المجموعة" },
      { status: 500 }
    );
  }
}
