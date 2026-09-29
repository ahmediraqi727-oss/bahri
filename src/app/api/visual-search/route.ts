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

interface ExtractedImageAttributes {
  primaryPartName: string;
  subCategory: string;
  color: string;
  shapeGeometry: string;
  visibleBrandOrText: string;
  keywords: string[];
  reasoning: string;
}

/**
 * دالة خوارزمية ذكية لحساب نسبة التطابق الفعلي (AliExpress / Amazon Lens Style)
 * تزن خصائص Gemini المستخرجة مقابل اسم ووصف وتصنيف كل منتج:
 * 1. مطابقة اسم القطعة الأساسي (وزن 50%)
 * 2. مطابقة الفئة والمنظومة الفرعية (وزن 30%)
 * 3. مطابقة الكلمات المفتاحية والماركة واللون والسمات الفيزيائية (وزن 20%)
 * 4. خصم نقاط للقطع المتنافرة (مثل عرض شخاطة سلف عند فحص كتف شحن)
 */
function computeSmartMatchScore(
  product: CandidateProduct,
  attr: ExtractedImageAttributes
): { score: number; reason: string; breakdown: { namePts: number; categoryPts: number; attributesPts: number } } {
  const pName = (product.name || "").trim().toLowerCase();
  const pNotes = (product.notes || "").trim().toLowerCase();
  const pCombined = `${pName} ${pNotes}`;

  const queryPart = (attr.primaryPartName || "").trim().toLowerCase();
  const queryCategory = (attr.subCategory || "").trim().toLowerCase();
  const queryBrand = (attr.visibleBrandOrText || "").trim().toLowerCase();
  const queryColor = (attr.color || "").trim().toLowerCase();
  const queryShape = (attr.shapeGeometry || "").trim().toLowerCase();
  const queryKeywords = (attr.keywords || []).map((k) => k.trim().toLowerCase()).filter((k) => k.length > 1);

  let namePts = 0;
  let categoryPts = 0;
  let attributesPts = 0;
  const matchReasons: string[] = [];

  // ==========================================
  // 1. مطابقة اسم القطعة الأساسي (الحد الأقصى: 50 نقطة)
  // ==========================================
  if (queryPart) {
    if (pName === queryPart) {
      namePts = 50;
      matchReasons.push(`تطابق تام لاسم القطعة "${queryPart}"`);
    } else if (pName.includes(queryPart)) {
      namePts = 46;
      matchReasons.push(`اسم المنتج يحتوي على "${queryPart}"`);
    } else if (queryPart.includes(pName)) {
      namePts = 42;
      matchReasons.push(`تطابق مباشر مع "${pName}"`);
    } else {
      // تفكيك الكلمات الأساسية لاسم القطعة
      const partWords = queryPart
        .split(/\s+/)
        .filter((w) => w.length > 2 && !["قطعة", "غيار", "دراجة", "نارية", "شحن"].includes(w));

      let matchedCount = 0;
      for (const w of partWords) {
        if (pName.includes(w)) matchedCount++;
      }

      if (partWords.length > 0 && matchedCount > 0) {
        const ratio = matchedCount / partWords.length;
        namePts = Math.round(ratio * 40);
        matchReasons.push(`تطابق جذري في تسمية القطعة (${matchedCount}/${partWords.length})`);
      }
    }
  }

  // فحص المرادفات القوية في الاسم
  for (const kw of queryKeywords) {
    if (kw.length > 2 && pName.includes(kw) && namePts < 38) {
      namePts = Math.max(namePts, 35);
      matchReasons.push(`تطابق مع مرادف رئيسي (${kw})`);
    }
  }

  // ==========================================
  // 2. مطابقة الفئة الفرعية والمنظومة (الحد الأقصى: 30 نقطة)
  // ==========================================
  if (queryCategory) {
    const catWords = queryCategory
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["قطع", "غيار", "عام"].includes(w));

    let catMatched = 0;
    for (const cw of catWords) {
      if (pNotes.includes(cw) || pName.includes(cw)) catMatched++;
    }

    if (catWords.length > 0 && catMatched > 0) {
      categoryPts = Math.min(30, Math.round((catMatched / catWords.length) * 30));
      matchReasons.push(`تطابق تصنيف المنظومة (${queryCategory})`);
    }
  }

  // توافقات تخصصية مبنية على معرفة قطع الدراجات (Domain Specific Knowledge)
  const isRectifierQuery = ["كتف", "ريكتفاير", "منظم", "شحن", "دينمو"].some((t) => queryPart.includes(t) || queryCategory.includes(t));
  const isRectifierProd = ["كتف", "ريكتفاير", "منظم", "شحن"].some((t) => pName.includes(t));
  if (isRectifierQuery && isRectifierProd && categoryPts < 22) {
    categoryPts = 26;
    matchReasons.push("تطابق وظيفة تنظيم وتوليد الشحن الكهربائي");
  }

  const isStarterQuery = ["سلف", "شخاطة", "مارش", "إشعال"].some((t) => queryPart.includes(t) || queryCategory.includes(t));
  const isStarterProd = ["سلف", "شخاطة", "مارش", "إشعال"].some((t) => pName.includes(t));
  if (isStarterQuery && isStarterProd && categoryPts < 22) {
    categoryPts = 26;
    matchReasons.push("تطابق منظومة التشغيل الكهربائي (سلف)");
  }

  const isLightingQuery = ["إشارة", "اشاره", "ضوء", "فانوس", "بكلايت", "لايت"].some((t) => queryPart.includes(t) || queryCategory.includes(t));
  const isLightingProd = ["إشارة", "اشاره", "ضوء", "فانوس", "بكلايت", "لايت"].some((t) => pName.includes(t));
  if (isLightingQuery && isLightingProd && categoryPts < 22) {
    categoryPts = 26;
    matchReasons.push("تطابق منظومة الإنارة والإشارات الضوئية");
  }

  // ==========================================
  // 3. مطابقة الكلمات المفتاحية والماركة واللون (الحد الأقصى: 20 نقطة)
  // ==========================================
  // فحص الماركة الظاهرة (مثل SAVINY, KOCT, 12V)
  if (queryBrand && queryBrand.length > 1) {
    if (pCombined.includes(queryBrand)) {
      attributesPts += 12;
      matchReasons.push(`تطابق الماركة التجارية (${queryBrand.toUpperCase()})`);
    }
  }

  // فحص الكلمات المفتاحية في الوصف
  let matchedKwCount = 0;
  for (const kw of queryKeywords) {
    if (kw.length > 2 && pCombined.includes(kw)) {
      matchedKwCount++;
    }
  }
  if (matchedKwCount > 0) {
    attributesPts += Math.min(8, matchedKwCount * 2);
  }

  // فحص اللون أو الشكل
  if (queryColor && queryColor.length > 2 && pCombined.includes(queryColor)) {
    attributesPts += 2;
  }
  if (queryShape && queryShape.length > 2 && pCombined.includes(queryShape)) {
    attributesPts += 2;
  }
  attributesPts = Math.min(20, attributesPts);

  // ==========================================
  // 4. نظام خصم التنافر (Strict Conflicting Item Penalty)
  // لمنع ظهور شخاطة سلف عند فحص كتف شحن أو العكس!
  // ==========================================
  let penalty = 0;

  // إذا كانت القطعة المفحوصة كتف شحن، والمنتج إشارة أو شخاطة سلف
  if (isRectifierQuery && !isStarterQuery && isStarterProd && !isRectifierProd) {
    penalty += 45; // خصم قوي لمنع خلط السلف مع الشحن
  }
  if (isRectifierQuery && !isLightingQuery && isLightingProd && !isRectifierProd) {
    penalty += 45; // خصم قوي لمنع خلط الإضاءة مع الشحن
  }
  if (isStarterQuery && !isLightingQuery && isLightingProd && !isStarterProd) {
    penalty += 45;
  }
  if (isLightingQuery && !isRectifierQuery && isRectifierProd && !isLightingProd) {
    penalty += 45;
  }

  // حساب النتيجة النهائية
  let calculatedScore = namePts + categoryPts + attributesPts - penalty;
  calculatedScore = Math.max(0, Math.min(98, calculatedScore));

  // إذا كان هناك تطابق تام للاسم والتصنيف، نضمن نسبة امتياز 90%-98%
  if (namePts >= 44 && categoryPts >= 20) {
    calculatedScore = Math.max(calculatedScore, Math.min(98, 88 + Math.round(attributesPts / 2)));
  }

  return {
    score: calculatedScore,
    reason: matchReasons.join(" • ") || "مطابقة عامة في المواصفات",
    breakdown: { namePts, categoryPts, attributesPts },
  };
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
          .limit(120);

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

    let extractedAttributes: ExtractedImageAttributes = {
      primaryPartName: "قطعة غيار دراجة",
      subCategory: "قطع غيار",
      color: "غير محدد",
      shapeGeometry: "قطعة ميكانيكية/كهربائية",
      visibleBrandOrText: "",
      keywords: ["قطع غيار", "دراجة"],
      reasoning: "فحص أولي للمظهر البصري للقطعة",
    };

    // Call Gemini 3.8 Flash Vision with 15 seconds timeout
    const apiKey = await getGeminiApiKey();

    if (apiKey && apiKey.length > 5) {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            timeout: 15000,
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const promptText = `
أنت خبير ذكاء اصطناعي فائق الدقة متخصص في فحص وتصنيف قطع غيار الدراجات النارية والكهربائية (شحن، إشعال، محرك، إنارة، بطاريات، أسلاك، مكابح) لمتجر "أحمد بحري" في العراق، تماماً مثل محرك البحث البصري المتقدم في AliExpress و Amazon Lens.

افحص الصورة المرفقة واستخرج الخصائص الدقيقة للقطعة:
1. primaryPartName: الاسم الفعلي الدقيق للقطعة باللغة العربية (أمثلة شائعة: "كتف شحن", "ريكتفاير", "منظم شحن دينمو", "شخاطة سلف", "بكلايت خلفي", "إشارة جانبية", "كابريتر", "بلك شرارة", "بطارية جافة", "مساعدين هيدروليك", "سفايف بريك", إلخ).
2. subCategory: الفئة الفرعية الدقيقة للمنظومة (أمثلة: "شحن وكهربائيات", "منظومة إشعال وسلف", "إضاءة وفوانيس", "محرك ووقود", "فرامل ومكابح", "شاحن وبطارية").
3. color: اللون الغالب للقطعة والعلبة (مثال: "أسود مع أسلاك ملونة", "فضي معدني").
4. shapeGeometry: الشكل الهندسي والمظهر المادي (مثال: "مربع مزعنف للتبريد مع فيشة وأسلاك", "أسطواني مدمج مع سلكين").
5. visibleBrandOrText: أي كتابة أو ماركة واضحة تظهر على القطعة أو الغلاف (مثال: SAVINY, KOCT, 12V, 150CC, إلخ).
6. keywords: قائمة كلمات مفتاحية ومرادفات عربية وإنجليزية للمنتج (مثال: ["كتف شحن", "ريكتفاير", "منظم شحن", "rectifier", "regulator", "دباب", "SAVINY"]).
7. reasoning: شرح موجز لما تم التعرف عليه بصرياً ولماذا هو هذه القطعة.
`;

        const callVisionWithTimeout = async (): Promise<any> => {
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
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
                      primaryPartName: { type: Type.STRING },
                      subCategory: { type: Type.STRING },
                      color: { type: Type.STRING },
                      shapeGeometry: { type: Type.STRING },
                      visibleBrandOrText: { type: Type.STRING },
                      keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                      reasoning: { type: Type.STRING },
                    },
                    required: ["primaryPartName", "subCategory", "keywords"],
                  },
                },
              });
              return res.text ? JSON.parse(res.text) : null;
            } catch (err) {
              console.warn("Gemini Vision generateContent error:", err);
              return null;
            }
          };
          return await Promise.race([run(), timeout]);
        };

        const visionResult = await callVisionWithTimeout();
        if (visionResult) {
          extractedAttributes = {
            primaryPartName: visionResult.primaryPartName || extractedAttributes.primaryPartName,
            subCategory: visionResult.subCategory || extractedAttributes.subCategory,
            color: visionResult.color || extractedAttributes.color,
            shapeGeometry: visionResult.shapeGeometry || extractedAttributes.shapeGeometry,
            visibleBrandOrText: visionResult.visibleBrandOrText || "",
            keywords: Array.isArray(visionResult.keywords) && visionResult.keywords.length > 0 ? visionResult.keywords : extractedAttributes.keywords,
            reasoning: visionResult.reasoning || "تم التعرف البصري بنجاح",
          };
        }
      } catch (geminiErr) {
        console.warn("Gemini vision call exception:", geminiErr);
      }
    }

    // =========================================================================
    // تطبيق خوارزمية حساب نسبة التطابق (Smart Matching Scoring Algorithm)
    // =========================================================================
    const scoredProducts: Array<{
      id: string;
      score: number;
      reason: string;
      breakdown: { namePts: number; categoryPts: number; attributesPts: number };
      name?: string;
      retailPrice?: number;
      image?: string;
      stock?: number;
    }> = [];

    for (const prod of productsList) {
      const matchResult = computeSmartMatchScore(prod, extractedAttributes);
      // استبعاد أي منتج تقل نسبة تطابقه عن 50% لضمان نتائج ذات صلة وثيقة فقط (AliExpress Style)
      if (matchResult.score >= 50) {
        scoredProducts.push({
          id: prod.id,
          score: matchResult.score,
          reason: matchResult.reason,
          breakdown: matchResult.breakdown,
          name: prod.name,
          retailPrice: prod.retailPrice,
          image: prod.image,
          stock: prod.stock,
        });
      }
    }

    // ترتيب المنتجات تلقائياً تنازلياً (Descending) بناءً على نسبة التطابق الأعلى
    scoredProducts.sort((a, b) => b.score - a.score);

    // الحد الأقصى لأعلى 12 نتيجة متطابقة
    const topMatches = scoredProducts.slice(0, 12);

    return NextResponse.json({
      success: true,
      data: {
        identifiedPart: extractedAttributes.primaryPartName,
        category: extractedAttributes.subCategory,
        color: extractedAttributes.color,
        shapeGeometry: extractedAttributes.shapeGeometry,
        visibleBrandOrText: extractedAttributes.visibleBrandOrText,
        keywords: extractedAttributes.keywords,
        attributes: extractedAttributes,
        matches: topMatches,
        totalFound: topMatches.length,
      },
    });
  } catch (err: unknown) {
    console.error("Visual search route general exception:", err);
    return NextResponse.json({
      success: false,
      error: "حدث خطأ أثناء فحص الصورة",
      data: {
        identifiedPart: "قطعة غيار دراجة",
        category: "قطع غيار",
        keywords: [],
        matches: [],
      },
    }, { status: 500 });
  }
}
