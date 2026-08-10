-- ==============================================================================
-- Migration: Complete Settings Schema, Watermark Config & Storage Pathing Support
-- ==============================================================================

-- 1. Add watermark_config column (JSONB) to `settings` table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'watermark_config'
    ) THEN
        ALTER TABLE public.settings ADD COLUMN watermark_config JSONB DEFAULT '{
            "enabled": false,
            "watermarkUrl": "",
            "position": "bottom-right",
            "customX": 85,
            "customY": 85,
            "opacity": 80,
            "scale": 20,
            "applyOnUpload": true,
            "targetBucket": "watermarked-products"
        }'::jsonb;
    END IF;
END $$;

-- 2. Add original_image_url column to `products` table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'original_image_url'
    ) THEN
        ALTER TABLE public.products ADD COLUMN original_image_url TEXT;
    END IF;
END $$;

-- 3. Add Advanced Theme, Location, Contact Social Media & App Download columns to `settings` table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS default_delivery_fee NUMERIC DEFAULT 5000,
ADD COLUMN IF NOT EXISTS default_delivery_duration TEXT DEFAULT '2 - 3 أيام عمل',
ADD COLUMN IF NOT EXISTS custom_themes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS active_theme_preset TEXT DEFAULT 'default',
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

-- 4. Ensure Storage Bucket `watermarked-products` exists and configure RLS Policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'watermarked-products',
    'watermarked-products',
    true,
    10485760, -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public Read Watermarked Storage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' AND policyname = 'Public Read Watermarked Storage'
    ) THEN
        CREATE POLICY "Public Read Watermarked Storage" 
        ON storage.objects FOR SELECT 
        USING (bucket_id = 'watermarked-products');
    END IF;
END $$;

-- Public/Auth Insert Watermarked Storage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' AND policyname = 'Public/Auth Insert Watermarked Storage'
    ) THEN
        CREATE POLICY "Public/Auth Insert Watermarked Storage" 
        ON storage.objects FOR INSERT 
        WITH CHECK (bucket_id = 'watermarked-products');
    END IF;
END $$;

-- Public/Auth Update Watermarked Storage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' AND policyname = 'Public/Auth Update Watermarked Storage'
    ) THEN
        CREATE POLICY "Public/Auth Update Watermarked Storage" 
        ON storage.objects FOR UPDATE 
        USING (bucket_id = 'watermarked-products');
    END IF;
END $$;

-- 5. Notify Supabase PostgREST server to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
