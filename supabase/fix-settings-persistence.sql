-- ============================================================
-- موقع أحمد بحري - إصلاح وتأكيد حفظ الإعدادات والتعديلات 100%
-- شغّل هذا الملف في Supabase SQL Editor لتحديث جدول الإعدادات
-- ============================================================

-- 1. التأكد من وجود جدول settings
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    site_name TEXT DEFAULT 'موقع أحمد بحري',
    logo TEXT DEFAULT '',
    hero_image TEXT DEFAULT '',
    footer_image TEXT DEFAULT '',
    font_family TEXT DEFAULT 'Cairo',
    font_size INTEGER DEFAULT 16,
    primary_color TEXT DEFAULT '#2563eb',
    secondary_color TEXT DEFAULT '#7c3aed',
    accent_color TEXT DEFAULT '#f59e0b',
    dark_mode BOOLEAN DEFAULT FALSE,
    whatsapp_link TEXT DEFAULT '',
    telegram_link TEXT DEFAULT '',
    messenger_link TEXT DEFAULT '',
    phone_link TEXT DEFAULT '07800000000',
    home_icon TEXT DEFAULT '',
    home_icon_size INTEGER DEFAULT 28,
    search_icon TEXT DEFAULT '',
    search_icon_size INTEGER DEFAULT 28,
    cart_icon TEXT DEFAULT '',
    cart_icon_size INTEGER DEFAULT 28,
    footer_height INTEGER DEFAULT 120,
    footer_right_text TEXT DEFAULT 'جميع الحقوق محفوظة © 2026 موقع أحمد بحري',
    footer_center_text TEXT DEFAULT 'أفضل المنتجات والخدمات لعملائنا الكرام',
    footer_left_text TEXT DEFAULT 'للطلب والتواصل: 07800000000',
    show_categories_carousel BOOLEAN DEFAULT TRUE,
    role_themes JSONB DEFAULT '{
        "manager": {"primary": "#1e40af", "secondary": "#7c3aed", "accent": "#f59e0b"},
        "admin": {"primary": "#059669", "secondary": "#0891b2", "accent": "#f97316"},
        "customer": {"primary": "#2563eb", "secondary": "#6366f1", "accent": "#ec4899"}
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. إزالة قيد المفتاح الأجنبي لضمان عدم رفض الإعدادات العامة عند الحفظ
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_user_id_fkey;

-- 3. إضافة الأعمدة المطلوبة للجداول الحالية إن لم تكن موجودة
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS messenger_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_link TEXT DEFAULT '07800000000';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS home_icon TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS home_icon_size INTEGER DEFAULT 28;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS search_icon TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS search_icon_size INTEGER DEFAULT 28;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS cart_icon TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS cart_icon_size INTEGER DEFAULT 28;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_height INTEGER DEFAULT 120;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_right_text TEXT DEFAULT 'جميع الحقوق محفوظة © 2026 موقع أحمد بحري';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_center_text TEXT DEFAULT 'أفضل المنتجات والخدمات لعملائنا الكرام';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_left_text TEXT DEFAULT 'للطلب والتواصل: 07800000000';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS show_categories_carousel BOOLEAN DEFAULT TRUE;

-- 4. إعداد سياسات RLS للسماح للجميع بالقراءة والحفظ بدون قيود
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view settings" ON public.settings;
CREATE POLICY "Anyone can view settings" ON public.settings FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Anyone can insert settings" ON public.settings;
CREATE POLICY "Anyone can insert settings" ON public.settings FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Anyone can update settings" ON public.settings;
CREATE POLICY "Anyone can update settings" ON public.settings FOR UPDATE USING (TRUE);

-- 5. إدراج سطر افتراضي إن كان الجدول فارغاً
INSERT INTO public.settings (site_name, phone_link)
SELECT 'موقع أحمد بحري', '07800000000'
WHERE NOT EXISTS (SELECT 1 FROM public.settings);
