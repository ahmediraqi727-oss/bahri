import { createClient } from "@supabase/supabase-js";

/**
 * دالة مساعدة مركزية في الباك اند لجلب مفتاح Google Gemini API
 * يتم البحث أولاً في جدول الإعدادات بقاعدة بيانات Supabase (مع Timeout لحماية سرعة الاستجابة)،
 * وفي حال لم يتم العثور عليه أو كان فارغاً يتم الاعتماد على متغير البيئة process.env.GEMINI_API_KEY كـ Fallback آمن.
 */
export async function getGeminiApiKey(): Promise<string> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes("placeholder")) {
      const fetchFromDb = async (): Promise<string | null> => {
        try {
          const supabase = createClient(supabaseUrl, supabaseKey);

          // 1. محاولة الجلب من جدول settings
          const { data: settingsData } = await supabase
            .from("settings")
            .select("gemini_api_key")
            .limit(1)
            .maybeSingle();

          if (settingsData?.gemini_api_key && typeof settingsData.gemini_api_key === "string" && settingsData.gemini_api_key.trim().length > 5) {
            return settingsData.gemini_api_key.trim();
          }

          // 2. محاولة الجلب من جدول store_settings كبديل
          const { data: storeData } = await supabase
            .from("store_settings")
            .select("gemini_api_key")
            .limit(1)
            .maybeSingle();

          if (storeData?.gemini_api_key && typeof storeData.gemini_api_key === "string" && storeData.gemini_api_key.trim().length > 5) {
            return storeData.gemini_api_key.trim();
          }
        } catch {
          // ignore error and proceed
        }
        return null;
      };

      // حماية بمهلة أقصاها ثانيتين لمنع تأخر استجابة الواجهة
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
      const dbKey = await Promise.race([fetchFromDb(), timeoutPromise]);

      if (dbKey) {
        return dbKey;
      }
    }
  } catch (err) {
    console.warn("Could not retrieve Gemini API key from Supabase DB:", err);
  }

  // 3. Fallback إلى متغير البيئة في السيرفر
  return (process.env.GEMINI_API_KEY || "").trim();
}
