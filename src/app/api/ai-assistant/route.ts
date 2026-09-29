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
    if (prompt && (!history.length || (history[history.length - 1].content !== prompt && history[history.length - 1].text !== prompt))) {
      history.push({ role: "user", content: prompt });
    }

    if (history.length === 0) {
      return NextResponse.json({ error: "لم يتم تقديم أي رسائل" }, { status: 400 });
    }

    const lastUserPrompt = prompt || history[history.length - 1]?.content || history[history.length - 1]?.text || "";
    const apiKey = await getGeminiApiKey();

    // Enrich live context from Supabase if available
    let dbSummaryText = "";
    let liveProdCount = storeContext.totalProducts ?? 0;
    let liveSuppliersCount = storeContext.suppliersCount ?? 0;
    let liveCategoriesCount = storeContext.categoriesCount ?? 0;
    let liveLowStockData: any[] = [];
    let liveRecentOrders: any[] = [];
    let specificProductMatches: any[] = [];

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

        if (prodCount != null) liveProdCount = prodCount;
        if (suppliersCount != null) liveSuppliersCount = suppliersCount;
        if (categoriesCount != null) liveCategoriesCount = categoriesCount;
        if (lowStockData) liveLowStockData = lowStockData;
        if (recentOrders) liveRecentOrders = recentOrders;

        // Try finding if the user asked about a specific product
        const cleanQueryWords = lastUserPrompt.replace(/[؟?.,!]/g, "").trim().split(/\s+/).filter((w: string) => w.length > 2);
        for (const word of cleanQueryWords.slice(0, 3)) {
          if (["عدد", "منتجات", "سعر", "مخزون", "ارباح", "اريد", "كيف", "اين"].includes(word)) continue;
          const { data: matched } = await supabase
            .from("products")
            .select("name, stock, retail_price, wholesale_price")
            .ilike("name", `%${word}%`)
            .limit(3);
          if (matched && matched.length > 0) {
            specificProductMatches = matched;
            break;
          }
        }

        dbSummaryText = `
بيانات حية مباشرة من قاعدة بيانات المتجر (Supabase):
- إجمالي عدد المنتجات المسجلة: ${liveProdCount}
- عدد الموردين المعتمدين: ${liveSuppliersCount}
- عدد الأقسام والفئات: ${liveCategoriesCount}
- منتجات كميتها منخفضة أو نفدت (أقل من أو يساوي 10 قطع):
${(liveLowStockData || []).map((p) => `  * ${p.name}: المتبقي ${p.stock} قطعة (سعر المفرد: ${(p.retail_price || 0).toLocaleString()} د.ع)`).join("\n") || "  * لا توجد تنبيهات نقص حالياً"}
- أحدث الفواتير والطلبات المسجلة:
${(liveRecentOrders || []).map((o) => `  * فاتورة ${o.invoice_serial || o.id.slice(0, 8)} للزبون (${o.customer_name || "زبون"}) بمبلغ ${(o.total || 0).toLocaleString()} د.ع - الحالة: ${o.status}`).join("\n") || "  * لا توجد طلبات حديثة"}
`;
      }
    } catch (dbErr) {
      console.warn("Could not enrich context from Supabase:", dbErr);
    }

    // Helper to generate a direct, intelligent answer based on store database
    const generateSmartDirectAnswer = (userQuery: string): string => {
      const q = userQuery.toLowerCase().trim();
      const roleTitle = storeContext.role === "manager" ? "المدير العام" : "إداري النظام";
      const total = liveProdCount || storeContext.totalProducts || 0;
      const retailVal = (storeContext.totalInventoryRetailValue ?? 0).toLocaleString();
      const costVal = (storeContext.totalInventoryCostValue ?? 0).toLocaleString();
      const lowCount = storeContext.lowStockCount ?? liveLowStockData.length ?? 0;

      // 1. Specific product match found
      if (specificProductMatches.length > 0) {
        const items = specificProductMatches.map((p) =>
          `• **${p.name}**\n  - الكمية المتوفرة: **${p.stock} قطعة** ${p.stock === 0 ? "⚠️ (نافد)" : p.stock <= 5 ? "⚠️ (كمية منخفضة)" : "✅"}\n  - سعر المفرد: **${(p.retail_price || 0).toLocaleString()} د.ع**\n  - سعر الجملة: **${(p.wholesale_price || 0).toLocaleString()} د.ع**`
        ).join("\n\n");

        return `🔍 **نتائج البحث المباشر في المخزون:**\n\n${items}\n\n💡 يمكنك مراجعة وتعديل هذه المنتجات مباشرة من [صفحة إدارة المنتجات](/dashboard/products).`;
      }

      // 2. Count of products / Products inventory
      if (
        q.includes("كم عدد") ||
        q.includes("عدد المنتجات") ||
        q.includes("كم منتج") ||
        q.includes("قائمة المنتجات") ||
        q.includes("المخزون") ||
        q.includes("منتجاتنا") ||
        q.includes("القطع") ||
        q.includes("قطع الغيار") ||
        q.includes("ملخص")
      ) {
        return `📦 **تقرير المخزون والمنتجات الحالية:**

مرحباً بك يا ${roleTitle}، إليك إحصائيات المنتجات المسجلة في متجر أحمد بحري:

• **إجمالي عدد المنتجات:** **${total} منتجاً مسجلاً**.
• **عدد الأقسام والتصنيفات:** **${liveCategoriesCount} قسم**.
• **القيمة الإجمالية للمخزون (سعر البيع):** ${retailVal !== "0" ? retailVal + " د.ع" : "محسوبة وفق الأسعار الحالية"}.
• **تنبيهات نقص الكمية:** **${lowCount} منتج** يحتاج لإعادة التعبئة.
• **عدد الموردين المسجلين:** **${liveSuppliersCount} مورد**.

💡 **ملاحظة إدارية:** يمكنك إضافة منتجات جديدة أو تصدير التقارير وجداول الأسعار في أي وقت من [لوحة إدارة المنتجات](/dashboard/products).`;
      }

      // 3. Low stock / Out of stock warnings
      if (
        q.includes("نقص") ||
        q.includes("نفاد") ||
        q.includes("منخفض") ||
        q.includes("تنبيه") ||
        q.includes("صفر") ||
        q.includes("خلصت") ||
        q.includes("تحذير")
      ) {
        const itemsList = (liveLowStockData.length > 0 ? liveLowStockData : (storeContext.topLowStockProducts || []))
          .map((p: any) => `• **${p.name}**: المتبقي **${p.stock} قطعة** (سعر المفرد: ${(p.retail_price || 0).toLocaleString()} د.ع)`)
          .join("\n");

        return `⚠️ **تقرير المنتجات المنخفضة والنافدة في المخزون:**

• عدد المنتجات التي أوشكت على النفاد (10 قطع أو أقل): **${lowCount} منتج**.

${itemsList ? `**أبرز القطع التي تحتاج إلى إعادة تعبئة سريعة:**\n${itemsList}` : "✅ لا توجد حالياً عناصر منخفضة أو حرجة في المخزون."}

💡 **إجراء مقترح:** يُنصح بالتواصل الفوري مع الموردين عبر صفحة [الموردين](/dashboard/suppliers) لطلب كميات إضافية وتجنب نفاد القطع المطلوبة.`;
      }

      // 4. Profits, Prices & Margins
      if (
        q.includes("ربح") ||
        q.includes("ارباح") ||
        q.includes("أرباح") ||
        q.includes("مال") ||
        q.includes("تكلفة") ||
        q.includes("سعر") ||
        q.includes("اسعار") ||
        q.includes("أسعار") ||
        q.includes("فلوس") ||
        q.includes("هامش")
      ) {
        const potentialProfit = Math.max(0, (storeContext.totalInventoryRetailValue ?? 0) - (storeContext.totalInventoryCostValue ?? 0));
        const profitMargin = (storeContext.totalInventoryCostValue ?? 0) > 0
          ? Math.round((potentialProfit / (storeContext.totalInventoryCostValue ?? 1)) * 100)
          : 0;

        return `💰 **تحليل الأسعار وهوامش الأرباح التقديرية:**

• **قيمة المخزون بسعر البيع (مفرد):** ${retailVal} د.ع.
• **إجمالي التكلفة التقديرية:** ${costVal} د.ع.
• **الربح الإجمالي المتوقع عند التصريف:** **${potentialProfit.toLocaleString()} د.ع**.
• **متوسط هامش الربح المقدر:** **${profitMargin}%**.

💡 **تلميح:** يمكنك ضبط وتعديل نسب وهوامش أسعار الجملة والمفرد آلياً من [إعدادات المتجر](/dashboard/settings).`;
      }

      // 5. Orders & Invoices
      if (
        q.includes("طلب") ||
        q.includes("طلبات") ||
        q.includes("فاتورة") ||
        q.includes("فواتير") ||
        q.includes("زبون") ||
        q.includes("زبائن") ||
        q.includes("مبيعات") ||
        q.includes("شحنات")
      ) {
        const ordersList = liveRecentOrders.map((o) =>
          `• فاتورة رقم **${o.invoice_serial || o.id.slice(0, 8)}** للزبون (**${o.customer_name || "زبون"}**) بمبلغ **${(o.total || 0).toLocaleString()} د.ع** (الحالة: ${o.status})`
        ).join("\n");

        return `📋 **سجل أحدث الطلبات والفواتير المسجلة:**

${ordersList || "• لا توجد طلبات حديثة مسجلة في الوقت الحالي."}

💡 يمكنك إدارة الشحنات وتغيير حالات الفواتير وطباعتها عبر صفحة [الفواتير والطلبات](/dashboard/orders).`;
      }

      // 6. Suppliers
      if (q.includes("مورد") || q.includes("موردين") || q.includes("شركات") || q.includes("تجار")) {
        return `🏭 **معلومات الموردين المعتمدين:**

• عدد الموردين المسجلين في المتجر: **${liveSuppliersCount} مورد**.
• يمكنك الاطلاع على جهات الاتصال الخاصة بالموردين وتحديث معلوماتهم وطلب شحنات جديدة مباشرة من صفحة [إدارة الموردين](/dashboard/suppliers).`;
      }

      // 7. General Inquiry Response (Direct and relevant)
      return `مرحباً بك يا ${roleTitle}! بخصوص استفسارك حول **"${userQuery}"**:

• **إجمالي منتجات المتجر:** ${total} منتج مسجل.
• **حالة المتجر العامة:** النظام يعمل بكفاءة وقاعدة بيانات المخزون محدثة ومربوطة مباشرة.
• يمكنك إنجاز المهام وإدارة العمليات بسرعة عبر الأقسام التالية:
  - 📦 [إدارة وتعديل المنتجات](/dashboard/products)
  - 🏷️ [مركز الباركود والماسح الضوئي](/dashboard/scanner)
  - 📑 [الفواتير ومبيعات الزبائن](/dashboard/orders)
  - ⚙️ [إعدادات النظام والذكاء الاصطناعي](/dashboard/settings)

هل ترغب في معرفة تفاصيل محددة عن مادة معينة أو أسعار قطع غيار؟`;
    };

    let finalAnswerText = "";

    // System prompt with full business domain knowledge
    const systemInstruction = `
أنت "مساعد الإدارة الذكي" (Smart Store Management Assistant) الرسمي لـ "متجر أحمد بحري" (Ahmed Bahri Store).
المتجر متخصص في تجارة الجملة والمفرد لقطع غيار الدراجات النارية والدراجات الكهربائية والشواحن والبطاريات والإكسسوارات في كركوك وكافة محافظات العراق (FASHION E-PIKE، Skins Jabali، إشارات، كابريترات، بطاريات شحن، إطارات، قطع غيار محركات، ومعدات الصيانة).
العملة الرسمية المعتمدة في المتجر هي الدينار العراقي (د.ع).

معلومات المستخدم الحالي:
- الدور: ${storeContext.role === "manager" ? "المدير العام للنظام (احمد العراقي)" : "إداري النظام (ahmed al adeeb / فريق الإدارة)"}
- إجمالي المنتجات في المتجر: ${liveProdCount}
- القيمة التقديرية للمخزون (سعر البيع): ${(storeContext.totalInventoryRetailValue ?? 0).toLocaleString()} د.ع
- تكلفة المخزون الكلية: ${(storeContext.totalInventoryCostValue ?? 0).toLocaleString()} د.ع
- المنتجات المنخفضة أو النافدة: ${storeContext.lowStockCount ?? liveLowStockData.length} منتج
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
5. إذا طلب المستخدم أمراً محدداً (مثل "كم عدد المنتجات"، "ملخص المخزون"، "تنبيهات المخزون")، قدم الإجابة الرقمية الدقيقة فوراً.
`;

    // Attempt calling Gemini API if apiKey exists
    if (apiKey && apiKey.length > 5) {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            timeout: 2500,
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        // Clean history so it strictly follows Gemini requirements:
        // 1. Must start with a 'user' turn
        // 2. Turns must alternate between 'user' and 'model'
        const validHistory: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];

        for (const msg of history) {
          const role = msg.role === "assistant" || msg.role === "model" ? "model" : "user";
          const text = (msg.content || msg.text || "").trim();
          if (!text) continue;

          // If we haven't started yet and this is model, skip it
          if (validHistory.length === 0 && role === "model") {
            continue;
          }

          // If consecutive same role, combine them into one turn
          if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === role) {
            validHistory[validHistory.length - 1].parts[0].text += "\n" + text;
          } else {
            validHistory.push({ role, parts: [{ text }] });
          }
        }

        // If after cleaning validHistory is empty or ends with model, append user prompt
        if (validHistory.length === 0 || validHistory[validHistory.length - 1].role !== "user") {
          validHistory.push({ role: "user", parts: [{ text: lastUserPrompt }] });
        }

        // Fast race helper with 2.8s timeout
        const callGeminiWithTimeout = async (): Promise<string | null> => {
          const timeout = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 2800)
          );

          const generate = async (): Promise<string | null> => {
            try {
              const res = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: validHistory,
                config: {
                  systemInstruction,
                  temperature: 0.7,
                },
              });
              return res.text || null;
            } catch {
              try {
                const res = await ai.models.generateContent({
                  model: "gemini-3.5-flash",
                  contents: validHistory,
                  config: {
                    systemInstruction,
                    temperature: 0.7,
                  },
                });
                return res.text || null;
              } catch {
                return null;
              }
            }
          };

          return await Promise.race([generate(), timeout]);
        };

        const geminiResult = await callGeminiWithTimeout();
        if (geminiResult && geminiResult.trim()) {
          finalAnswerText = geminiResult.trim();
        }
      } catch (geminiCallErr) {
        console.warn("Direct Gemini call failed, using live direct answer:", geminiCallErr);
      }
    }

    // If Gemini didn't return text (e.g. invalid key or timeout), use live data answer
    if (!finalAnswerText) {
      finalAnswerText = generateSmartDirectAnswer(lastUserPrompt);
    }

    // Stream the final answer smoothly in small chunks for consistent, real-time UX
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const words = finalAnswerText.split(" ");
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
