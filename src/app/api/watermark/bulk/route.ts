export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { processAndUploadWatermarkImage } from "@/lib/ImageProcessor";
import { WatermarkConfig, WatermarkOptions } from "@/lib/types";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "بيانات JSON غير صالحة" }, { status: 400 });
    }

    const { productIds, items, options, watermarkConfig, revertToOriginal } = body || {};
    const effectiveConfig = options || watermarkConfig;

    let targetItems: Array<{ id: string; image: string; original_image_url?: string }> = [];

    if (Array.isArray(productIds) && productIds.length > 0) {
      const { data: dbProducts, error: fetchError } = await supabase
        .from("products")
        .select("id, image, original_image_url")
        .in("id", productIds);

      if (fetchError) {
        return NextResponse.json({ error: `فشل جلب المنتجات: ${fetchError.message}` }, { status: 400 });
      }
      if (dbProducts) targetItems = dbProducts;
    } else if (Array.isArray(items) && items.length > 0) {
      targetItems = items.map((it: any) => ({
        id: it.id,
        image: it.image || "",
        original_image_url: it.originalImageUrl || it.original_image_url || it.image || "",
      }));
    }

    if (targetItems.length === 0) {
      return NextResponse.json({ error: "لم يتم تحديد أي منتجات للمعالجة." }, { status: 400 });
    }

    if (!revertToOriginal && (!effectiveConfig || !effectiveConfig.watermarkUrl)) {
      return NextResponse.json({ error: "رابط الشعار (Watermark) غير متوفر في الإعدادات." }, { status: 400 });
    }

    let processedCount = 0;
    let failedCount = 0;
    const results = [];

    for (const item of targetItems) {
      try {
        if (revertToOriginal) {
          const originalUrl = item.original_image_url || item.image;
          if (originalUrl) {
            await supabase
              .from("products")
              .update({ image: originalUrl, original_image_url: originalUrl, updated_at: new Date().toISOString() })
              .eq("id", item.id);
            processedCount++;
            results.push({ id: item.id, success: true, image: originalUrl });
          } else {
            failedCount++;
            results.push({ id: item.id, success: false, error: "لا توجد صورة أصلية" });
          }
        } else {
          const sourceUrl = item.original_image_url || item.image;
          if (!sourceUrl) {
            failedCount++;
            continue;
          }
          const newWatermarkedUrl = await processAndUploadWatermarkImage(sourceUrl, effectiveConfig);
          if (newWatermarkedUrl) {
            await supabase
              .from("products")
              .update({ image: newWatermarkedUrl, original_image_url: sourceUrl, updated_at: new Date().toISOString() })
              .eq("id", item.id);
            processedCount++;
            results.push({ id: item.id, success: true, image: newWatermarkedUrl });
          } else {
            failedCount++;
            results.push({ id: item.id, success: false, error: "فشل المعالجة بمحرك Sharp" });
          }
        }
      } catch (itemErr: any) {
        failedCount++;
        results.push({ id: item.id, success: false, error: itemErr?.message || "خطأ غير معروف" });
      }
    }

    return NextResponse.json({
      success: true,
      message: `تمت المعالجة بنجاح: ${processedCount}، الفشل: ${failedCount}`,
      processedCount,
      failedCount,
      results,
    });
  } catch (error: any) {
    console.error("API Bulk Watermark Error:", error);
    return NextResponse.json({ error: error?.message || "خطأ داخلي في الخادم" }, { status: 500 });
  }
}
