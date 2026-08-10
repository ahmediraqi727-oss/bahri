-- ==============================================================================
-- MASTER PRODUCTION SCRIPT - AHMED BAHRI STORE (FINAL & COMPLETE VERIFIED)
-- Run this script in Supabase Dashboard → SQL Editor
-- ==============================================================================

-- 1. تفعيل الإضافات البرمجية الأساسية
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. جدول إعدادات النظام والهوية البصرية (public.settings)
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
    eye_protection BOOLEAN DEFAULT FALSE,
    watermark_config JSONB DEFAULT '{"enabled": false, "watermarkUrl": "", "position": "bottom-right", "customX": 85, "customY": 85, "opacity": 80, "scale": 20, "applyOnUpload": true, "targetBucket": "watermarked-products"}'::jsonb,
    custom_themes JSONB DEFAULT '[]'::jsonb,
    active_theme_preset TEXT DEFAULT 'classic-blue',
    store_address TEXT DEFAULT 'العراق - بغداد - الشارع التجاري الرئيسي',
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
    default_delivery_fee NUMERIC DEFAULT 5000,
    default_delivery_duration TEXT DEFAULT '2 - 3 أيام عمل',
    role_themes JSONB DEFAULT '{"manager": {"primary": "#1e40af", "secondary": "#7c3aed", "accent": "#f59e0b"}, "admin": {"primary": "#059669", "secondary": "#0891b2", "accent": "#f97316"}, "customer": {"primary": "#2563eb", "secondary": "#6366f1", "accent": "#ec4899"}}'::jsonb,
    auto_delete_days INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ضمان إضافة جميع الأعمدة إن كان جدول settings موجوداً مسبقاً
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS site_name TEXT DEFAULT 'موقع أحمد بحري';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS logo TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hero_image TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hero_image_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_image TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_image_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Cairo';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS font_size INTEGER DEFAULT 16;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#2563eb';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#7c3aed';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#f59e0b';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS eye_protection BOOLEAN DEFAULT FALSE;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS watermark_config JSONB DEFAULT '{"enabled": false, "watermarkUrl": "", "position": "bottom-right", "customX": 85, "customY": 85, "opacity": 80, "scale": 20, "applyOnUpload": true, "targetBucket": "watermarked-products"}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS custom_themes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS active_theme_preset TEXT DEFAULT 'classic-blue';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_address TEXT DEFAULT 'العراق - بغداد - الشارع التجاري الرئيسي';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_map_link TEXT DEFAULT 'https://maps.google.com';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_map_embed_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS messenger_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS messenger_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_link TEXT DEFAULT '07800000000';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_link2 TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS direct_phone TEXT DEFAULT '07800000000';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS facebook_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS instagram_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tiktok_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS youtube_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS app_download_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS android_app_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ios_app_url TEXT DEFAULT '';
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
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_delivery_fee NUMERIC DEFAULT 5000;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_delivery_duration TEXT DEFAULT '2 - 3 أيام عمل';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS role_themes JSONB DEFAULT '{"manager": {"primary": "#1e40af", "secondary": "#7c3aed", "accent": "#f59e0b"}, "admin": {"primary": "#059669", "secondary": "#0891b2", "accent": "#f97316"}, "customer": {"primary": "#2563eb", "secondary": "#6366f1", "accent": "#ec4899"}}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_delete_days INTEGER DEFAULT 30;

-- إدخال السجل الافتراضي للإعدادات إن كان الجدول فارغاً
INSERT INTO public.settings (site_name)
SELECT 'موقع أحمد بحري'
WHERE NOT EXISTS (SELECT 1 FROM public.settings LIMIT 1);

-- 3. جدول الأقسام (public.categories)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  image TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  priority INT DEFAULT 1,
  display_order INT DEFAULT 1,
  sort_order INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  keywords TEXT DEFAULT '',
  views INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS priority INT DEFAULT 1;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 1;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 1;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS keywords TEXT DEFAULT '';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;

-- 4. جدول الموردين (public.suppliers)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- 5. جدول المنتجات (public.products)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  image TEXT DEFAULT '',
  original_image_url TEXT DEFAULT '',
  cost_price NUMERIC DEFAULT 0,
  wholesale_price NUMERIC DEFAULT 0,
  profit_margin NUMERIC DEFAULT 0,
  retail_price NUMERIC DEFAULT 0,
  stock NUMERIC DEFAULT 0,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  is_published BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_image_url TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS profit_margin NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS retail_price NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- 6. جدول الربط الوسيط بين المنتجات والأقسام (public.product_categories)
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, category_id)
);

-- 7. جدول الطلبات (public.orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number BIGINT GENERATED ALWAYS AS IDENTITY,
  invoice_serial TEXT DEFAULT '',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  total NUMERIC DEFAULT 0,
  delivery_fee NUMERIC DEFAULT 0,
  delivery_duration TEXT DEFAULT '',
  delivery_time TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  notes TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_serial TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_duration TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_time TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT '';

-- 8. جدول الزبائن وتتبع الزوار (public.customers)
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT UNIQUE,
  name TEXT DEFAULT 'مجهول',
  phone TEXT DEFAULT '',
  city TEXT DEFAULT '',
  governorate TEXT DEFAULT '',
  address TEXT DEFAULT '',
  email TEXT DEFAULT '',
  user_id UUID,
  device_type TEXT DEFAULT 'حاسوب',
  visit_count INT DEFAULT 1,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  visited_pages JSONB DEFAULT '[]'::jsonb,
  is_blocked BOOLEAN DEFAULT false,
  is_registered BOOLEAN DEFAULT false,
  is_suspicious BOOLEAN DEFAULT false,
  change_count INT DEFAULT 0,
  name_history JSONB DEFAULT '[]'::jsonb,
  phone_history JSONB DEFAULT '[]'::jsonb,
  address_history JSONB DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. جدول سلة المهملات المتقدمة (public.trash)
CREATE TABLE IF NOT EXISTS public.trash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT DEFAULT 'product',
  entity_id TEXT DEFAULT '',
  entity_name TEXT DEFAULT 'عنصر',
  data JSONB DEFAULT '{}'::jsonb,
  deleted_by TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ DEFAULT now()
);

-- 10. جدول المبيعات والتقارير (public.sales)
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  total NUMERIC DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  profit NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. جدول سجل النشاطات والأحداث (public.activity_log)
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_role TEXT DEFAULT 'manager',
  action TEXT DEFAULT 'update',
  entity TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  details TEXT DEFAULT '',
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. جدول معرض صور الواجهة Carousel (public.hero_gallery)
CREATE TABLE IF NOT EXISTS public.hero_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
  image_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hero_gallery_position ON public.hero_gallery (position);

-- 13. جدول الإشعارات (public.notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  product_id TEXT DEFAULT '',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. تفعيل سياسات الأمان الملساء (Smooth RLS) لمنع أي رفض للصلاحيات
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hero_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for settings" ON public.settings;
CREATE POLICY "Allow all operations for settings" ON public.settings FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for categories" ON public.categories;
CREATE POLICY "Allow all operations for categories" ON public.categories FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for products" ON public.products;
CREATE POLICY "Allow all operations for products" ON public.products FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for product_categories" ON public.product_categories;
CREATE POLICY "Allow all operations for product_categories" ON public.product_categories FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on suppliers" ON public.suppliers;
CREATE POLICY "Allow all operations on suppliers" ON public.suppliers FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on orders" ON public.orders;
CREATE POLICY "Allow all operations on orders" ON public.orders FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on customers" ON public.customers;
CREATE POLICY "Allow all operations on customers" ON public.customers FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on trash" ON public.trash;
CREATE POLICY "Allow all operations on trash" ON public.trash FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on sales" ON public.sales;
CREATE POLICY "Allow all operations on sales" ON public.sales FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on activity_log" ON public.activity_log;
CREATE POLICY "Allow all operations on activity_log" ON public.activity_log FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on hero_gallery" ON public.hero_gallery;
CREATE POLICY "Allow all operations on hero_gallery" ON public.hero_gallery FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on notifications" ON public.notifications;
CREATE POLICY "Allow all operations on notifications" ON public.notifications FOR ALL TO public, authenticated, anon USING (true) WITH CHECK (true);

-- 15. منح الصلاحيات الشاملة للأدوار
GRANT ALL ON TABLE public.settings TO authenticated, anon, public;
GRANT ALL ON TABLE public.categories TO authenticated, anon, public;
GRANT ALL ON TABLE public.products TO authenticated, anon, public;
GRANT ALL ON TABLE public.product_categories TO authenticated, anon, public;
GRANT ALL ON TABLE public.suppliers TO authenticated, anon, public;
GRANT ALL ON TABLE public.orders TO authenticated, anon, public;
GRANT ALL ON TABLE public.customers TO authenticated, anon, public;
GRANT ALL ON TABLE public.trash TO authenticated, anon, public;
GRANT ALL ON TABLE public.sales TO authenticated, anon, public;
GRANT ALL ON TABLE public.activity_log TO authenticated, anon, public;
GRANT ALL ON TABLE public.hero_gallery TO authenticated, anon, public;
GRANT ALL ON TABLE public.notifications TO authenticated, anon, public;

-- 16. تحديث الـ Schema Cache في Supabase فوراً
NOTIFY pgrst, 'reload schema';
