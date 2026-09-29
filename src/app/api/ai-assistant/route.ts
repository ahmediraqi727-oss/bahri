import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGeminiApiKey } from "@/lib/gemini-key";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "model" | "assistant";
  content?: string;
  text?: string;
}

interface StoreContext {
  role?: string;
  userName?: string;
  totalProducts?: number;
  totalInventoryRetailValue?: number;
  totalInventoryCostValue?: number;
  outOfStockCount?: number;
  lowStockCount?: number;
  suppliersCount?: number;
  categoriesCount?: number;
  topLowStockProducts?: Array<{ name: string; stock: number; retailPrice: number }>;
  recentOrdersCount?: number;
  recentActivitiesSummary?: string[];
  unreadNotificationsCount?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages = [], prompt, storeContext = {} as StoreContext } = body;

    // Build the history array
    let history: ChatMessage[] = Array.isArray(messages) ? [...messages] : [];
    if (prompt && (!history.length || history[history.length - 1].content !== prompt)) {
      history.push({ role: "user", content: prompt });
    }

    if (history.length === 0) {
      return NextResponse.json({ error: "لم يتم تقديم أي رسائل" }, { status: 400 });
    }

    const lastUserPrompt = prompt || history[history.length - 1]?.content || "";
    const apiKey = await getGeminiApiKey();

    // Enrich live context from Supabase if available
    let dbSummaryText = "";
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey && !supabaseUrl.includes("placeholder")) {
        const supabase = createClient(supabaseUrl, supabaseKey);

        const [
          { count: prodCount },
          { data: lowStockData },
          { data: recentOrders },
          { count: suppliersCount },
          { count: categoriesCount },
        ] = await Promise.all([
          supabase.from("products").select("*", { count: "exact", head: true }),
          supabase.from("products").select("name, stock, retail_price, wholesale_price, cost_price").lte("stock", 10).order("stock", { ascending: true }).limit(8),
          supabase.from("orders").select("id, invoice_serial, total, status, customer_name, created_at").order("created_at", { ascending: false }).limit(5),
          supabase.from("suppliers").select("*", { count: "exact", head: true }),
          supabase.from("categories").select("*", { count: "exact", head: true }),
        ]);

        dbSummaryText = `
بيانات حية مباشرة من قاعدة بيانات المتجر (Supabase):
- إجمالي عدد المنتجات المسجلة: ${prodCount ?? storeContext.totalProducts ?? "متوفر"}
- عدد الموردين المعتمدين: ${suppliersCount ?? storeContext.suppliersCount ?? "متوفر"}
- عدد الأقسام والفئات: ${categoriesCount ?? storeContext.categoriesCount ?? "متوفر"}
- منتجات كميتها منخفضة أو نفدت (أقل من أو يساوي 10 قطع):
${(lowStockData || []).map((p) => `  * ${p.name}: المتبقي ${p.stock} قطعة (سعر المفرد: ${(p.retail_price || 0).toLocaleString()} د.ع)`).join("\n") || "  * لا توجد تنبيهات نقص حالياً"}
- أحدث الفواتير والطلبات المسجلة:
${(recentOrders || []).map((o) => `  * فاتورة ${o.invoice_serial || o.id.slice(0, 8)} للزبون (${o.customer_name || "زبون"}) بمبلغ ${(o.total || 0).toLocaleString()} د.ع - الحالة: ${o.status}`).join("\n") || "  * لا توجد طلبات حديثة"}
`;
      }
    } catch (dbErr) {
      console.warn("Could not enrich context from Supabase:", dbErr);
    }

    // Helper to generate a comprehensive, intelligent fallback answer when Gemini API key is missing or invalid
    const generateSmartFallbackAnswer = (userQuery: string): string => {
      const q = userQuery.toLowerCase();
      const total = storeContext.totalProducts ?? 0;
      const retailVal = (storeContext.totalInventoryRetailValue ?? 0).toLocaleString();
      const costVal = (storeContext.totalInventoryCostValue ?? 0).toLocaleString();
      const lowCount = storeContext.lowStockCount ?? 0;
      const roleTitle = storeContext.role === "manager" ? "المدير العام" : "إداري النظام";

      if (q.includes("ملخص") || q.includes("مخزون") || q.includes("كمية")) {
        return `📊 **ملخص المخزون الشامل (متجر أحمد بحري)**

مرحباً بك يا ${roleTitle}، إليك ملخص حالة المخزون الحالية:

• **إجمالي عدد المنتجات:** ${total} منتج مسجل.
• **القيمة الإجمالية للمخزون (سعر البيع):** ${retailVal} د.ع.
• **إجمالي تكلفة المخزون:** ${costVal} د.ع.
• **تنبيهات انخفاض الكمية:** ${lowCount} منتج يحتاج للمراجعة.
• **عدد الموردين المسجلين:** ${storeContext.suppliersCount ?? 0} مورد.

💡 **توجيه مفيد:** يمكنك الانتقال إلى صفحة [إدارة المنتجات](/dashboard/products) لإجراء تعديلات فورية على الأسعار أو الكميات.`;
      }

      if (q.includes("تنبيه") || q.includes("نفاد") || q.includes("منخفض") || q.includes("نقص")) {
        const itemsList = (storeContext.topLowStockProducts || [])
          .map((p: { name: string; stock: number; retailPrice: number }) => `• **${p.name}**: المتبقي ${p.stock} قطعة (السعر: ${(p.retailPrice || 0).toLocaleString()} د.ع)`)
          .join("\n");

        return `⚠️ **تقرير تنبيهات المخزون والقطع النافدة**

• عدد المنتجات المنخفضة أو التي نفدت: **${lowCount} منتج**.

${itemsList ? `**أبرز القطع التي تحتاج لإعادة التعبئة:**\n${itemsList}` : "✅ لا توجد حالياً عناصر حرجة في المخزون."}

💡 **إجراء مقترح:** يمكنك التواصل المباشر مع الموردين من صفحة [الموردين](/dashboard/suppliers) لطلب شحنات جديدة.`;
      }

      if (q.includes("ربح") || q.includes("أرباح") || q.includes("مال") || q.includes("تكلفة")) {
        const potentialProfit = Math.max(0, (storeContext.totalInventoryRetailValue ?? 0) - (storeContext.totalInventoryCostValue ?? 0));
        const profitMargin = (storeContext.totalInventoryCostValue ?? 0) > 0
          ? Math.round((potentialProfit / (storeContext.totalInventoryCostValue ?? 1)) * 100)
          : 0;

        return `💰 **تحليل الأرباح وهوامش التسعير**

• **قيمة البيع المتوقعة:** ${retailVal} د.ع.
• **إجمالي التكلفة الفعلية:** ${costVal} د.ع.
• **الربح الإجمالي المتوقع:** ${potentialProfit.toLocaleString()} د.ع.
• **متوسط هامش الربح التقديري:** ${profitMargin}%.

💡 **ملاحظة:** يمكنك مراجعة تقارير المبيعات الدقيقة وحركات الصندوق اليومية من قسم [الإحصاءات والتقارير](/dashboard/analytics).`;
      }

      return `👋 مرحباً بك يا ${roleTitle} في **مساعد الإدارة الذكي** لمتجر أحمد بحري!

أنا هنا لمساعدتك في كل ما يتعلق بإدارة المتجر:
• **المخزون والقطع:** متابعة توفر قطع غيار الدراجات والبطاريات والشواحن.
• **الأسعار والأرباح:** تسعير الجملة والمفرد وتحليل هامش الربح.
• **الفواتير والطلبات:** متابعة الشحنات والعملاء.
• **أكواد الباركود:** طباعة اللواصق الحرارية EAN-13 عبر مركز الباركود.

❓ ما الذي ترغب بالاطلاع عليه الآن؟ يمكنك النقر على الأزرار السريعة أدناه أو كتابة استفسارك مباشرة!`;
    };

    // System prompt with full business domain knowledge
    const systemInstruction = `
أنت "مساعد الإدارة الذكي" (Smart Store Management Assistant) الرسمي لـ "متجر أحمد بحري" (Ahmed Bahri Store).
المتجر متخصص في تجارة الجملة والمفرد لقطع غيار الدراجات النارية والدراجات الكهربائية والشواحن والبطاريات والإكسسوارات في كركوك وكافة محافظات العراق (FASHION E-PIKE، Skins Jabali، إشارات، كابريترات، بطاريات شحن، إطارات، قطع غيار محركات، ومعدات الصيانة).
العملة الرسمية المعتمدة في المتجر هي الدينار العراقي (د.ع).

معلومات المستخدم الحالي:
- الدور: ${storeContext.role === "manager" ? "المدير العام للنظام (احمد العراقي)" : "إداري النظام (ahmed al adeeb / فريق الإدارة)"}
- إجمالي المنتجات في المتجر: ${storeContext.totalProducts ?? "بيانات حية"}
- القيمة التقديرية للمخزون (سعر البيع): ${(storeContext.totalInventoryRetailValue ?? 0).toLocaleString()} د.ع
- تكلفة المخزون الكلية: ${(storeContext.totalInventoryCostValue ?? 0).toLocaleString()} د.ع
- المنتجات المنخفضة أو النافدة: ${storeContext.lowStockCount ?? 0} منتج
- عدد الإشعارات غير المقروءة: ${storeContext.unreadNotificationsCount ?? 0}
${dbSummaryText}

مهامك وإرشادات الإجابة:
1. أجب بدقة واحترافية وبطريقة منظمة وواضحة باللغة العربية مع لمسة ودية مناسبة لبيئة العمل العراقية.
2. استخدم تنسيق Markdown الجميل (عناوين، نقاط •، أرقام، جداول إذا لزم الأمر، خط عريض **bold**، ورموز تعبيرية ملائمة).
3. عند الإجابة عن استفسارات المخزون أو الأسعار أو الأرباح، اعتمد على الأرقام الحقيقية المذكورة في السياق وقدم نصائح عملية لإدارة المخزون والتسعير.
4. إرشاد الإدارة لكيفية استخدام أقسام لوحة التحكم:
   - إدارة المنتجات والتعديل الجماعي: (/dashboard/products)
   - مركز الباركود والـ QR والطباعة الحرارية: (/dashboard/scanner)
   - فواتير الطلبات والزبائن: (/dashboard/orders و /dashboard/invoices)
   - الأقسام وتصنيف القطع: (/dashboard/categories)
   - حساب الأرباح والتقارير: (/dashboard/analytics)
   - سلة المهملات واسترجاع المحذوفات: (/dashboard/trash)
5. إذا طلب المستخدم أمرًا سريعاً (مثل "ملخص المخزون"، "تنبيهات المخزون"، "حساب الأرباح"، "آخر الحركات")، قدم ملخصاً متكاملاً واقتراحات بالخطوات التالية المفيدة للمدير.
6. حافظ على لهجة مهذبة، ذكية، واثقة، ومبنية على مساعدة الإدارة في زيادة المبيعات وتنظيم المتجر بأفضل شكل.
`;

    // Attempt calling Gemini API if apiKey exists
    if (apiKey && apiKey.length > 5) {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const formattedContents = history.map((msg) => {
          const role = msg.role === "assistant" || msg.role === "model" ? "model" : "user";
          const text = msg.content || msg.text || "";
          return {
            role,
            parts: [{ text }],
          };
        });

        let responseStream;
        try {
          responseStream = await ai.models.generateContentStream({
            model: "gemini-3.8-flash",
            contents: formattedContents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });
        } catch (primaryErr) {
          console.warn("gemini-3.8-flash error, falling back to gemini-3.5-flash:", primaryErr);
          responseStream = await ai.models.generateContentStream({
            model: "gemini-3.5-flash",
            contents: formattedContents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });
        }

        // Return streaming response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of responseStream) {
                const chunkText = chunk.text;
                if (chunkText) {
                  controller.enqueue(encoder.encode(chunkText));
                }
              }
              controller.close();
            } catch (streamErr) {
              console.error("Gemini stream chunk error:", streamErr);
              // Provide fallback text if stream aborted
              controller.enqueue(
                encoder.encode("\n\n" + generateSmartFallbackAnswer(lastUserPrompt))
              );
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Transfer-Encoding": "chunked",
          },
        });
      } catch (geminiCallErr) {
        console.warn("Direct Gemini call failed, returning smart grounded response:", geminiCallErr);
      }
    }

    // Smart Fallback streaming when API key is not valid or unavailable
    const fallbackText = generateSmartFallbackAnswer(lastUserPrompt);
    const encoder = new TextEncoder();

    // Stream the fallback text smoothly in small chunks for consistent streaming UX
    const stream = new ReadableStream({
      async start(controller) {
        const words = fallbackText.split(" ");
        for (let i = 0; i < words.length; i += 3) {
          const chunk = words.slice(i, i + 3).join(" ") + (i + 3 < words.length ? " " : "");
          controller.enqueue(encoder.encode(chunk));
          await new Promise((r) => setTimeout(r, 20));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err: unknown) {
    console.error("AI assistant API outer exception:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء معالجة الطلب في مساعد الإدارة: " + message },
      { status: 500 }
    );
  }
}
