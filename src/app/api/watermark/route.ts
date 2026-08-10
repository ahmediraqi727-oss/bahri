import { NextRequest, NextResponse } from "next/server";
import { applyWatermarkToBuffer, processAndUploadWatermarkImage, urlToBuffer } from "@/lib/ImageProcessor";
import { WatermarkConfig } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, watermarkConfig, preview } = body as {
      imageUrl: string;
      watermarkConfig: WatermarkConfig;
      preview?: boolean;
    };

    if (!imageUrl) {
      return NextResponse.json({ error: "رابط الصورة الأصلية مطلوب" }, { status: 400 });
    }

    if (!watermarkConfig || !watermarkConfig.watermarkUrl) {
      return NextResponse.json({ error: "رابط شعار العلامة المائية مطلوب" }, { status: 400 });
    }

    // 1. Preview Mode: returns base64 data URL for instant live preview without uploading to storage
    if (preview) {
      const baseBuffer = await urlToBuffer(imageUrl);
      const { buffer, format } = await applyWatermarkToBuffer(baseBuffer, watermarkConfig);
      const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format}`;
      const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
      return NextResponse.json({ success: true, previewUrl: dataUrl });
    }

    // 2. Storage Upload Mode: processes and uploads to Supabase Storage (/products/watermarked/)
    const watermarkedUrl = await processAndUploadWatermarkImage(imageUrl, watermarkConfig);

    return NextResponse.json({
      success: true,
      watermarkedUrl,
      originalUrl: imageUrl,
    });
  } catch (error: any) {
    console.error("Watermark API error:", error);
    return NextResponse.json(
      { error: error?.message || "حدث خطأ أثناء معالجة العلامة المائية" },
      { status: 500 }
    );
  }
}
