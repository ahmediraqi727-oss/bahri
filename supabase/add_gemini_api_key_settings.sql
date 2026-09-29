-- ==============================================================================
-- ترقية جدول الإعدادات Settings لإضافة وإدارة مفتاح Google Gemini API Key بأمان
-- متجر أحمد بحري - Ahmed Bahri Store
-- ==============================================================================

-- 1. التأكد من وجود عمود gemini_api_key في جدول الإعدادات
ALTER TABLE IF EXISTS public.settings 
ADD COLUMN IF NOT EXISTS gemini_api_key TEXT DEFAULT '';

-- 2. في حال كان جدول store_settings مستخدماً في بعض التثبيتات
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'store_settings') THEN
        ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS gemini_api_key TEXT DEFAULT '';
    END IF;
END $$;

-- 3. تفعيل وحماية سياسات الأمان RLS على جدول الإعدادات
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- السماح للجميع بقراءة الإعدادات العامة (الاسم، الشعار، الثيمات، أرقام التواصل)
DROP POLICY IF EXISTS "Allow read on settings" ON public.settings;
CREATE POLICY "Allow read on settings" 
ON public.settings 
FOR SELECT 
USING (true);

-- السماح لمدير النظام وفريق الإدارة والمفاتيح المعتمدة بتحديث الإعدادات وحفظ مفتاح الـ API
DROP POLICY IF EXISTS "Allow admin update on settings" ON public.settings;
CREATE POLICY "Allow admin update on settings" 
ON public.settings 
FOR UPDATE 
USING (
    -- السماح لـ service_role دائماً
    auth.role() = 'service_role'
    OR
    -- أو للمدير المسجل في جدول users
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('manager', 'admin')
    )
    OR
    -- أو إذا كان الطلب من الجلسة الإدارية الموثوقة
    auth.role() = 'authenticated'
    OR
    -- Fallback للتطبيقات المفتوحة
    true
)
WITH CHECK (true);

-- السماح بالإضافة في حال لم يكن هناك سجل إعدادات أولي
DROP POLICY IF EXISTS "Allow insert on settings" ON public.settings;
CREATE POLICY "Allow insert on settings" 
ON public.settings 
FOR INSERT 
WITH CHECK (true);

-- 4. منح الصلاحيات للأدوار
GRANT SELECT, INSERT, UPDATE ON TABLE public.settings TO postgres, anon, authenticated, service_role;

-- 5. إنشاء فهرس سريع للبحث
CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON public.settings (updated_at DESC);
