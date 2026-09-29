import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGeminiApiKey } from "@/lib/gemini-key";

export const dynamic = "force-dynamic";

interface CandidateProduct {
  id: string;
  name: string;
  notes?: string;
  category?: string;
  retailPrice?: number;
  stock?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image, candidateProducts = [] } = body;

    if (!image) {
      return NextResponse.json({ error: "الرجاء تقديم صورة صالحة للبحث" }, { status: 400 });
    }

    // Get the dynamic Gemini API Key from Supabase / environment
    const apiKey = await getGeminiApiKey();

    if (!apiKey || apiKey.length < 5) {
      return NextResponse.json({
        success: false,
        requiresApiKey: true,
        message: "لم يتم تفعيل مفتاح Google Gemini API بعد. يرجى إضافته من صفحة إعدادات لوحة التحكم لاستخدام ميزة البحث الذكي بالصورة.",
      });
    }

    // Extract Base64 and MIME type
    let mimeType = "image/jpeg";
    let base64Data = "";

    if (image.startsWith("data:")) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        base64Data = image.split(",")[1] || image;
      }
    } else {
      base64Data = image;
    }

    // If candidate products are not passed, fetch them from Supabase
    let productsList: CandidateProduct[] = candidateProducts;
    if (productsList.length === 0) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey && !supabaseUrl.includes("placeholder")) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { data } = await supabase
            .from("products")
            .select("id, name, notes, retail_price, stock")
            .limit(100);

          if (data) {
            productsList = data.map((p) => ({
              id: p.id,
              name: p.name,
              notes: p.notes,
              retailPrice: p.retail_price,
              stock: p.stock,
            }));
          }
        }
      } catch (dbErr) {
        console.warn("Could not load products for visual search from Supabase:", dbErr);
      }
    }

    // Initialize GoogleGenAI SDK
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const productsCatalogText = productsList.slice(0, 80).map((p, idx) =>
      `${idx + 1}. [ID: ${p.id}] ${p.name} | ملاحظات/تصنيف: ${p.notes || "عام"}`
    ).join("\n");

    const promptText = `
أنت خبير محترف في فحص وتصنيف قطع غيار الدراجات النارية والدراجات الكهربائية والشواحن والبطاريات لـ "متجر أحمد بحري" في العراق.
افحص الصورة المرفقة بعناية فائقة وتعرف على قطعة الغيار الظاهرة فيها بدقة (مثل: إشارة خلفية أو أمامية، كابريتر، بطارية شحن، مساعدين، ضوء أمامي، مكابح، إطارات، دراجة كهربائية FASHION E-PIKE، Skins Jabali، وغيرها).

قارن هذه القطعة بقائمة منتجات المتجر التالية:
${productsCatalogText || "لا توجد قائمة منتجات، قم بتحديد اسم القطعة بدقة عامة"}

المطلوب:
1. تحديد اسم القطعة الظاهرة باللغة العربية الفصحى الواضحة.
2. تصنيف القطعة (القسم).
3. استخراج الكلمات المفتاحية الرئيسية للقطعة للبحث السريع.
4. إذا وجدت تطابقاً في قائمة المنتجات، حدد الـ ID ونسبة المطابقة (من 0 إلى 100) وسبب المطابقة.
`;

    // Call Gemini 3.8 Flash Vision model with structured JSON output schema
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            identifiedPart: {
              type: Type.STRING,
              description: "الاسم الواضح لقطعة الغيار الظاهرة في الصورة باللغة العربية",
            },
            category: {
              type: Type.STRING,
              description: "تصنيف أو قسم القطعة (مثل: إشارات، بطاريات، محركات، شواحن، فرامل)",
            },
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "الكلمات المفتاحية الأساسية للبحث",
            },
            description: {
              type: Type.STRING,
              description: "شرح موجز للقطعة وحالتها ولونها",
            },
            matches: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  score: { type: Type.NUMBER, description: "نسبة التطابق من 0 إلى 100" },
                  reason: { type: Type.STRING, description: "سبب التطابق" },
                },
                required: ["id", "score"],
              },
            },
          },
          required: ["identifiedPart", "category", "keywords", "matches"],
        },
      },
    });

    const responseText = response.text || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(responseText);
    } catch {
      console.warn("Could not parse JSON response from Gemini Vision:", responseText);
    }

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (err: unknown) {
    console.error("Visual search error:", err);
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("API key not valid") || message.includes("API_KEY_INVALID")) {
      return NextResponse.json({
        success: false,
        requiresApiKey: true,
        message: "مفتاح Google Gemini API غير صالح أو لم يتم تفعيله بعد. يرجى إدخال مفتاح صالح في [لوحة التحكم > الإعدادات].",
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "حدث خطأ أثناء فحص الصورة بواسطة الذكاء الاصطناعي: " + message,
      },
      { status: 500 }
    );
  }
}
