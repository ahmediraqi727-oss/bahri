-- ============================================================
-- موقع أحمد بحري - إعادة إنشاء وتحديث جدول الإعدادات Settings
-- ============================================================

-- Drop the old table if it has a mismatched structure
DROP TABLE IF EXISTS public.settings CASCADE;

-- Create the clean settings table with all required columns
CREATE TABLE public.settings (
    id SERIAL PRIMARY KEY,
    site_name TEXT DEFAULT 'متجر أحمد بحري',
    logo TEXT DEFAULT '',
    hero_image TEXT DEFAULT '',
    footer_image TEXT DEFAULT '',
    font_family TEXT DEFAULT 'Cairo',
    font_size INTEGER DEFAULT 16,
    primary_color TEXT DEFAULT '#2563eb',
    secondary_color TEXT DEFAULT '#7c3aed',
    accent_color TEXT DEFAULT '#f59e0b',
    dark_mode BOOLEAN DEFAULT FALSE,
    eye_protection BOOLEAN DEFAULT FALSE,
    address TEXT DEFAULT 'العراق - كركوك',
    map_url TEXT DEFAULT '',
    phone_primary TEXT DEFAULT '07728028930',
    phone_secondary TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    facebook TEXT DEFAULT '',
    instagram TEXT DEFAULT '',
    tiktok TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS & Set Policies
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on settings" ON public.settings;
CREATE POLICY "Allow public read on settings" ON public.settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert/update on settings" ON public.settings;
CREATE POLICY "Allow public insert/update on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Insert initial default record for ID = 1
INSERT INTO public.settings (id, address, map_url, phone_primary)
VALUES (1, 'العراق - كركوك - احمد اغا', 'https://maps.app.goo.gl/...', '07728028930')
ON CONFLICT (id) DO UPDATE SET
    address = EXCLUDED.address,
    map_url = EXCLUDED.map_url,
    phone_primary = EXCLUDED.phone_primary;
