import { NextRequest, NextResponse } from "next/server";
import { applyWatermarkToBuffer, processAndUploadWatermarkImage, urlToBuffer } from "@/lib/ImageProcessor";
import { WatermarkConfig } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, watermarkConfig, preview = true } = body as {
      imageUrl: string;
      watermarkConfig: WatermarkConfig;
      preview?: boolean;
    };

    if (!imageUrl || !watermarkConfig?.watermarkUrl) {
      return NextResponse.json({ error: "الرابط أو إعدادات الشعار غير متوفرة" }, { status: 400 });
    }

    // 1. If upload to storage is specifically requested (preview === false)
    if (preview === false) {
      const watermarkedUrl = await processAndUploadWatermarkImage(imageUrl, watermarkConfig);
      return NextResponse.json({
        success: true,
        watermarkedUrl,
        originalUrl: imageUrl,
      });
    }

    // 2. Download original image as Buffer
    const imageBuffer = await urlToBuffer(imageUrl);

    // 3. Apply watermark via Sharp engine
    const { buffer: processedBuffer, format } = await applyWatermarkToBuffer(imageBuffer, watermarkConfig);

    // 4. Convert result to Base64 Data URL for instant live preview without storage upload
    const base64Image = processedBuffer.toString("base64");
    const mimeType = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
    const previewUrl = `data:${mimeType};base64,${base64Image}`;

    return NextResponse.json({
      success: true,
      previewUrl,
    });
  } catch (error: any) {
    console.error("Server preview API error:", error);
    return NextResponse.json(
      { error: error?.message || "فشل توليد المعاينة على السيرفر" },
      { status: 500 }
    );
  }
}
