-- =============================================================================
-- Supabase RLS Migration Script for footer_settings & settings Tables
-- Fixes 403 Forbidden / Permission Denied Errors during Admin Settings Save
-- Execute this script in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- =============================================================================

-- 1. Create table footer_settings if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.footer_settings (
  id INT PRIMARY KEY DEFAULT 1,
  footer_min_height INT DEFAULT 160,
  container_padding_y INT DEFAULT 32,
  container_padding_x INT DEFAULT 16,
  
  right_enabled BOOLEAN DEFAULT true,
  right_title TEXT DEFAULT 'عن المتجر',
  right_text TEXT DEFAULT 'جميع الحقوق محفوظة © 2026 متجر أحمد بحري',
  right_image_url TEXT DEFAULT '',
  right_image_width INT DEFAULT 120,
  right_image_height INT DEFAULT 40,
  right_link_url TEXT DEFAULT '',
  right_font_size INT DEFAULT 14,
  
  center_enabled BOOLEAN DEFAULT true,
  center_title TEXT DEFAULT 'رسالتنا وخدماتنا',
  center_text TEXT DEFAULT 'أفضل المنتجات والخدمات لعملائنا الكرام',
  center_image_url TEXT DEFAULT '',
  center_image_width INT DEFAULT 100,
  center_image_height INT DEFAULT 48,
  center_link_url TEXT DEFAULT '',
  center_font_size INT DEFAULT 14,
  
  left_enabled BOOLEAN DEFAULT true,
  left_title TEXT DEFAULT 'الطلب والتواصل',
  left_text TEXT DEFAULT 'للطلب والتواصل المباشر: 07800000000',
  left_image_url TEXT DEFAULT '',
  left_image_width INT DEFAULT 120,
  left_image_height INT DEFAULT 40,
  left_link_url TEXT DEFAULT 'tel:07800000000',
  left_font_size INT DEFAULT 14,
  
  full_width_enabled BOOLEAN DEFAULT false,
  full_width_title TEXT DEFAULT 'إرشادات وشروط الشراء بالجملة',
  full_width_text TEXT DEFAULT 'تخفيضات خاصة وخصومات تصاعدية على الكميات الكبيرة لأصحاب المحلات والورش.',
  full_width_bg_color TEXT DEFAULT '#1e293b',
  full_width_text_color TEXT DEFAULT '#ffffff',
  full_width_font_size INT DEFAULT 13,
  
  show_social_links BOOLEAN DEFAULT true,
  show_store_location_link BOOLEAN DEFAULT true,
  show_app_download_links BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.footer_settings ENABLE ROW LEVEL SECURITY;

-- 3. Drop all legacy restrictive policies
DROP POLICY IF EXISTS "Allow public read on footer_settings" ON public.footer_settings;
DROP POLICY IF EXISTS "Allow public insert on footer_settings" ON public.footer_settings;
DROP POLICY IF EXISTS "Allow public update on footer_settings" ON public.footer_settings;
DROP POLICY IF EXISTS "Allow public all on footer_settings" ON public.footer_settings;
DROP POLICY IF EXISTS "Allow authenticated full control on footer_settings" ON public.footer_settings;

-- 4. Create comprehensive permissive RLS policy allowing SELECT, INSERT, UPDATE, UPSERT
CREATE POLICY "Allow public all on footer_settings"
  ON public.footer_settings
  FOR ALL
  TO public, authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 5. Grant explicit table permissions to anon, authenticated, and service_role
GRANT ALL ON TABLE public.footer_settings TO anon, authenticated, service_role;

-- 6. Insert initial row if not exists
INSERT INTO public.footer_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
