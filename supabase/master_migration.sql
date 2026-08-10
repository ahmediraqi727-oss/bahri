-- ==============================================================================
-- MASTER PRODUCTION SCRIPT - AHMED BAHRI STORE (FINAL & VERIFIED)
-- ==============================================================================

-- 1. تفعيل الإضافات البرمجية الأساسية
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. توحيد جدول settings بالكامل بنوع UUID ومحفظاً لكافة الأعمدة الحديثة
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    site_name TEXT DEFAULT 'موقع أحمد بحري',
    logo TEXT DEFAULT '',
    hero_image TEXT DEFAULT '',
    hero_image_url TEXT DEFAULT '',
    footer_image TEXT DEFAULT '',
    footer_image_url TEXT DEFAULT '',
    font_family TEXT DEFAULT 'Cairo',
    font_size INTEGER DEFAULT 16,
    primary_color TEXT DEFAULT '#2563eb',
    secondary_color TEXT DEFAULT '#7c3aed',
    accent_color TEXT DEFAULT '#f59e0b',
    dark_mode BOOLEAN DEFAULT FALSE,
    watermark_config JSONB DEFAULT '{"enabled": false, "watermarkUrl": "", "position": "bottom-right", "customX": 85, "customY": 85, "opacity": 80, "scale": 20, "applyOnUpload": true, "targetBucket": "watermarked-products"}'::jsonb,
    custom_themes JSONB DEFAULT '[]'::jsonb,
    active_theme_preset TEXT DEFAULT 'default',
    store_address TEXT DEFAULT 'العراق - بغداد',
    store_map_link TEXT DEFAULT 'https://maps.google.com',
    store_map_embed_url TEXT DEFAULT '',
    whatsapp_link TEXT DEFAULT '',
    whatsapp_number TEXT DEFAULT '',
    telegram_link TEXT DEFAULT '',
    telegram_url TEXT DEFAULT '',
    messenger_link TEXT DEFAULT '',
    messenger_url TEXT DEFAULT '',
    phone_link TEXT DEFAULT '07800000000',
    phone_link2 TEXT DEFAULT '',
    direct_phone TEXT DEFAULT '07800000000',
    facebook_link TEXT DEFAULT '',
    instagram_link TEXT DEFAULT '',
    tiktok_link TEXT DEFAULT '',
    youtube_link TEXT DEFAULT '',
    app_download_url TEXT DEFAULT '',
    android_app_url TEXT DEFAULT '',
    ios_app_url TEXT DEFAULT '',
    default_delivery_fee NUMERIC DEFAULT 5000,
    default_delivery_duration TEXT DEFAULT '2 - 3 أيام عمل',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ضمان حقن أي أعمدة ناقصة إن وُجد الجدول مسبقاً
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS watermark_config JSONB DEFAULT '{"enabled": false, "watermarkUrl": "", "position": "bottom-right", "customX": 85, "customY": 85, "opacity": 80, "scale": 20, "applyOnUpload": true, "targetBucket": "watermarked-products"}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS custom_themes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS active_theme_preset TEXT DEFAULT 'default';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_address TEXT DEFAULT 'العراق - بغداد';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_map_link TEXT DEFAULT 'https://maps.google.com';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_map_embed_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_link2 TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS facebook_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS instagram_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tiktok_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS youtube_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS app_download_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS android_app_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ios_app_url TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_image_url TEXT;

-- إدخال السجل الافتراضي للإعدادات إن كان الجدول فارغاً
INSERT INTO public.settings (site_name)
SELECT 'موقع أحمد بحري'
WHERE NOT EXISTS (SELECT 1 FROM public.settings LIMIT 1);

-- 3. توحيد جدول categories بمعرف UUID وضمان القيود الفريدة
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  image TEXT DEFAULT '',
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. تفعيل سياسات الأمان الملساء (Smooth RLS) لمنع أي رفض للصلاحيات
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for settings" ON public.settings;
CREATE POLICY "Allow all operations for settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for categories" ON public.categories;
CREATE POLICY "Allow all operations for categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for products" ON public.products;
CREATE POLICY "Allow all operations for products" ON public.products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on trash" ON public.trash;
CREATE POLICY "Allow all operations on trash" ON public.trash FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on suppliers" ON public.suppliers;
CREATE POLICY "Allow all operations on suppliers" ON public.suppliers FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on orders" ON public.orders;
CREATE POLICY "Allow all operations on orders" ON public.orders FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on customers" ON public.customers;
CREATE POLICY "Allow all operations on customers" ON public.customers FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

-- 5. منح الصلاحيات الشاملة للأدوار
GRANT ALL ON TABLE public.settings TO authenticated, anon, public;
GRANT ALL ON TABLE public.categories TO authenticated, anon, public;
GRANT ALL ON TABLE public.products TO authenticated, anon, public;
GRANT ALL ON TABLE public.trash TO authenticated, anon, public;
GRANT ALL ON TABLE public.suppliers TO authenticated, anon, public;
GRANT ALL ON TABLE public.orders TO authenticated, anon, public;
GRANT ALL ON TABLE public.customers TO authenticated, anon, public;

-- 6. تحديث الـ Schema Cache في Supabase فوراً
NOTIFY pgrst, 'reload schema';
