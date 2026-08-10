-- ==============================================================================
-- MASTER MIGRATION SCRIPT — AHMED BAHRI DIGITAL STORE ENGINE
-- Run this script in: Supabase Dashboard → SQL Editor
-- Features: Settings Table, Categories Table, Trash Table, Posts, Watermark Config,
-- Smooth RLS Policies (Prevents Permission Denied 403 & Function missing errors),
-- PostgREST Schema Cache Reload.
-- ==============================================================================

-- =============================================
-- 1. SETTINGS TABLE SCHEMA & COLUMNS ASSURANCE
-- =============================================
CREATE TABLE IF NOT EXISTS public.settings (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  site_name TEXT DEFAULT 'موقع أحمد بحري',
  logo TEXT DEFAULT '',
  hero_image TEXT DEFAULT '',
  footer_image TEXT DEFAULT '',
  font_family TEXT DEFAULT 'Cairo',
  font_size INT DEFAULT 16,
  primary_color TEXT DEFAULT '#2563eb',
  secondary_color TEXT DEFAULT '#7c3aed',
  accent_color TEXT DEFAULT '#f59e0b',
  dark_mode BOOLEAN DEFAULT false,
  eye_protection BOOLEAN DEFAULT false,
  whatsapp_link TEXT DEFAULT '',
  telegram_link TEXT DEFAULT '',
  messenger_link TEXT DEFAULT '',
  phone_link TEXT DEFAULT '07800000000',
  phone_link2 TEXT DEFAULT '',
  facebook_link TEXT DEFAULT '',
  instagram_link TEXT DEFAULT '',
  tiktok_link TEXT DEFAULT '',
  youtube_link TEXT DEFAULT '',
  store_address TEXT DEFAULT 'العراق - بغداد - الشارع التجاري الرئيسي',
  store_map_link TEXT DEFAULT 'https://maps.google.com',
  store_map_embed_url TEXT DEFAULT '',
  app_download_url TEXT DEFAULT '',
  android_app_url TEXT DEFAULT '',
  ios_app_url TEXT DEFAULT '',
  custom_themes JSONB DEFAULT '[]'::jsonb,
  active_theme_preset TEXT DEFAULT 'classic-blue',
  home_icon TEXT DEFAULT '',
  home_icon_size INT DEFAULT 28,
  search_icon TEXT DEFAULT '',
  search_icon_size INT DEFAULT 28,
  cart_icon TEXT DEFAULT '',
  cart_icon_size INT DEFAULT 28,
  footer_height INT DEFAULT 120,
  footer_right_text TEXT DEFAULT 'جميع الحقوق محفوظة © 2026 موقع أحمد بحري',
  footer_center_text TEXT DEFAULT 'أفضل المنتجات والخدمات لعملائنا الكرام',
  footer_left_text TEXT DEFAULT 'للطلب والتواصل: 07800000000',
  show_categories_carousel BOOLEAN DEFAULT true,
  default_delivery_fee NUMERIC DEFAULT 5000,
  default_delivery_duration TEXT DEFAULT '2 - 3 أيام عمل',
  watermark_config JSONB DEFAULT '{
      "enabled": false,
      "watermarkUrl": "",
      "position": "bottom-right",
      "customX": 85,
      "customY": 85,
      "opacity": 80,
      "scale": 20,
      "applyOnUpload": true,
      "targetBucket": "watermarked-products"
  }'::jsonb,
  role_themes JSONB DEFAULT '{
      "manager": {"primary": "#1e40af", "secondary": "#7c3aed", "accent": "#f59e0b"},
      "admin": {"primary": "#059669", "secondary": "#0891b2", "accent": "#f97316"},
      "customer": {"primary": "#2563eb", "secondary": "#6366f1", "accent": "#ec4899"}
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if settings table was created previously
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS watermark_config JSONB DEFAULT '{"enabled": false, "watermarkUrl": "", "position": "bottom-right", "customX": 85, "customY": 85, "opacity": 80, "scale": 20, "applyOnUpload": true, "targetBucket": "watermarked-products"}'::jsonb,
ADD COLUMN IF NOT EXISTS default_delivery_fee NUMERIC DEFAULT 5000,
ADD COLUMN IF NOT EXISTS default_delivery_duration TEXT DEFAULT '2 - 3 أيام عمل',
ADD COLUMN IF NOT EXISTS custom_themes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS active_theme_preset TEXT DEFAULT 'classic-blue',
ADD COLUMN IF NOT EXISTS store_address TEXT DEFAULT 'العراق - بغداد - الشارع التجاري الرئيسي',
ADD COLUMN IF NOT EXISTS store_map_link TEXT DEFAULT 'https://maps.google.com',
ADD COLUMN IF NOT EXISTS store_map_embed_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS facebook_link TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS instagram_link TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS tiktok_link TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS youtube_link TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS phone_link2 TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS app_download_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS android_app_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS ios_app_url TEXT DEFAULT '';

-- Insert initial single row if settings table is empty
INSERT INTO public.settings (site_name)
SELECT 'موقع أحمد بحري'
WHERE NOT EXISTS (SELECT 1 FROM public.settings LIMIT 1);

-- Smooth RLS for Settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for settings" ON public.settings;
CREATE POLICY "Allow all operations for settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 2. CATEGORIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  image TEXT DEFAULT '',
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Smooth RLS for Categories (Prevents is_manager_or_admin function missing errors)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
DROP POLICY IF EXISTS "Managers and Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Allow all operations for categories" ON public.categories;
CREATE POLICY "Allow all operations for categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 3. PRODUCTS TABLE & ORIGINAL IMAGE URL COLUMN
-- =============================================
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_image_url TEXT;

-- Smooth RLS for Products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for products" ON public.products;
CREATE POLICY "Allow all operations for products" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 4. TRASH TABLE (Soft-Delete & Recovery System)
-- =============================================
CREATE TABLE IF NOT EXISTS public.trash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'product' | 'category' | 'supplier'
  entity_id TEXT NOT NULL,
  entity_data JSONB NOT NULL,
  deleted_by TEXT DEFAULT 'manager',
  deleted_at TIMESTAMPTZ DEFAULT now()
);

-- Smooth RLS for Trash
ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for trash" ON public.trash;
CREATE POLICY "Allow all operations for trash" ON public.trash FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 5. STORAGE BUCKET FOR WATERMARKED PRODUCTS
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'watermarked-products',
    'watermarked-products',
    true,
    10485760, -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies
DROP POLICY IF EXISTS "Public Read Watermarked Storage" ON storage.objects;
CREATE POLICY "Public Read Watermarked Storage" ON storage.objects FOR SELECT USING (bucket_id = 'watermarked-products');

DROP POLICY IF EXISTS "Public/Auth Insert Watermarked Storage" ON storage.objects;
CREATE POLICY "Public/Auth Insert Watermarked Storage" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'watermarked-products');

DROP POLICY IF EXISTS "Public/Auth Update Watermarked Storage" ON storage.objects;
CREATE POLICY "Public/Auth Update Watermarked Storage" ON storage.objects FOR UPDATE USING (bucket_id = 'watermarked-products');

-- =============================================
-- 6. NOTIFY POSTGREST SCHEMA CACHE RELOAD
-- =============================================
NOTIFY pgrst, 'reload schema';
