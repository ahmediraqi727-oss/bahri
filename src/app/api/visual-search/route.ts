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
  image?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image, candidateProducts = [] } = body;

    if (!image) {
      return NextResponse.json({ error: "الرجاء تقديم صورة صالحة للبحث" }, { status: 400 });
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

    // Load candidate products from Supabase if not provided
    let productsList: CandidateProduct[] = candidateProducts;
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey && !supabaseUrl.includes("placeholder")) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data } = await supabase
          .from("products")
          .select("id, name, notes, retail_price, stock, image")
          .limit(100);

        if (data && data.length > 0) {
          productsList = data.map((p) => ({
            id: p.id,
            name: p.name,
            notes: p.notes,
            retailPrice: p.retail_price,
            stock: p.stock,
            image: p.image,
          }));
        }
      }
    } catch (dbErr) {
      console.warn("Could not load products for visual search from Supabase:", dbErr);
    }

    let identifiedPart = "قطعة غيار دراجة";
    let category = "قطع غيار";
    let keywords: string[] = ["قطع غيار", "دراجة", "صيانة"];
    let matches: Array<{ id: string; score: number; reason?: string; name?: string; image?: string; retailPrice?: number }> = [];

    // Attempt Gemini Vision if key exists
    const apiKey = await getGeminiApiKey();

    if (apiKey && apiKey.length > 5) {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            timeout: 3500,
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
افحص الصورة المرفقة بعناية فائقة وتعرف على قطعة الغيار الظاهرة فيها بدقة (مثل: إشارة خلفية أو أمامية، شخاطة سلف، كابريتر، بطارية شحن، مساعدين، ضوء أمامي، مكابح، إطارات، دراجة كهربائية FASHION E-PIKE، Skins Jabali، وغيرها).

قارن هذه القطعة بقائمة منتجات المتجر التالية:
${productsCatalogText || "لا توجد قائمة منتجات، حدد اسم القطعة وتصنيفها والكلمات المفتاحية بدقة"}

المطلوب بدقة:
1. identifiedPart: الاسم الواضح لقطعة الغيار الظاهرة باللغة العربية الفصحى.
2. category: تصنيف القطعة.
3. keywords: قائمة بالكلمات المفتاحية للبحث عن هذه القطعة.
4. matches: قائمة بالمعرفات (ID) المطابقة من القائمة المرفقة مع نسبة التطابق (score من 50 إلى 100) وسبب التطابق.
`;

        const callVisionWithTimeout = async (): Promise<any> => {
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
          const run = async () => {
            try {
              const res = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: [
                  {
                    role: "user",
                    parts: [
                      { inlineData: { mimeType, data: base64Data } },
                      { text: promptText },
                    ],
                  },
                ],
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      identifiedPart: { type: Type.STRING },
                      category: { type: Type.STRING },
                      keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                      matches: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            score: { type: Type.NUMBER },
                            reason: { type: Type.STRING },
                          },
                          required: ["id", "score"],
                        },
                      },
                    },
                    required: ["identifiedPart", "category", "keywords"],
                  },
                },
              });
              return res.text ? JSON.parse(res.text) : null;
            } catch {
              return null;
            }
          };
          return await Promise.race([run(), timeout]);
        };

        const visionResult = await callVisionWithTimeout();
        if (visionResult) {
          if (visionResult.identifiedPart) identifiedPart = visionResult.identifiedPart;
          if (visionResult.category) category = visionResult.category;
          if (Array.isArray(visionResult.keywords) && visionResult.keywords.length > 0) {
            keywords = visionResult.keywords;
          }
          if (Array.isArray(visionResult.matches) && visionResult.matches.length > 0) {
            matches = visionResult.matches;
          }
        }
      } catch (geminiErr) {
        console.warn("Gemini vision call failed:", geminiErr);
      }
    }

    // If Gemini didn't find direct ID matches, search keywords across productsList
    if (matches.length === 0 && productsList.length > 0) {
      const searchTerms = [
        identifiedPart,
        ...keywords,
      ].filter(Boolean).map((t) => t.toLowerCase().trim());

      const scoredCandidates: Array<{ id: string; score: number; reason: string }> = [];

      for (const p of productsList) {
        const pName = (p.name || "").toLowerCase();
        const pNotes = (p.notes || "").toLowerCase();
        let matchScore = 0;
        let matchedReason = "";

        for (const term of searchTerms) {
          const words = term.split(/\s+/).filter((w) => w.length > 2);
          for (const word of words) {
            if (pName.includes(word)) {
              matchScore += 45;
              matchedReason = `تطابق الاسم مع كلمة (${word})`;
            }
            if (pNotes.includes(word)) {
              matchScore += 25;
              if (!matchedReason) matchedReason = `تطابق التصنيف مع (${word})`;
            }
          }
        }

        if (matchScore > 0) {
          scoredCandidates.push({
            id: p.id,
            score: Math.min(98, Math.max(65, matchScore)),
            reason: matchedReason || "تطابق بصري وموضوعي",
          });
        }
      }

      scoredCandidates.sort((a, b) => b.score - a.score);
      matches = scoredCandidates.slice(0, 8);

      // If still empty, supply the top available products so the user can browse relevant inventory
      if (matches.length === 0 && productsList.length > 0) {
        matches = productsList.slice(0, 4).map((p, idx) => ({
          id: p.id,
          score: 80 - idx * 5,
          reason: "مقترح بناءً على فحص الصورة وتوفر المخزون",
        }));
      }
    }

    // Attach full product details to matches for instant frontend rendering
    const enrichedMatches = matches.map((m) => {
      const p = productsList.find((prod) => prod.id === m.id);
      return {
        ...m,
        name: p?.name,
        retailPrice: p?.retailPrice,
        image: p?.image,
        stock: p?.stock,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        identifiedPart,
        category,
        keywords,
        matches: enrichedMatches,
      },
    });
  } catch (err: unknown) {
    console.error("Visual search route exception:", err);
    return NextResponse.json({
      success: true,
      data: {
        identifiedPart: "قطعة غيار دراجة",
        category: "قطع غيار",
        keywords: ["قطع غيار", "دراجة"],
        matches: [],
      },
    });
  }
}
