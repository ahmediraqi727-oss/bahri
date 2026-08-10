-- ==============================================================================
-- Migration: Add Watermark Configuration & Smart Storage Pathing Support
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

-- 3. Ensure Storage Bucket `watermarked-products` exists and configure RLS Policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'watermarked-products',
    'watermarked-products',
    true,
    10485760, -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ensure public access RLS policy for reading watermarked images
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

-- Ensure insert/update policy for storage objects
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

-- 4. Schema Cache Reset & Column Assurance for PostgREST
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS default_delivery_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS default_delivery_duration TEXT DEFAULT '2 - 3 أيام عمل';

-- Notify Supabase PostgREST server to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
