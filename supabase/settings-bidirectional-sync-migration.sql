-- ==============================================================================
-- Schema Alignment: Settings Table Full Synchronous Matrix
-- ==============================================================================

-- 1. إضافة وتوحيد كافة الأعمدة لضمان قبول الـ Payload دون استثناء
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS site_name TEXT DEFAULT 'متجر أحمد بحري';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_name TEXT DEFAULT 'متجر أحمد بحري';
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
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS eye_protection BOOLEAN DEFAULT false;

-- قنوات الاتصال والتواصل
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS messenger_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS messenger_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_primary TEXT DEFAULT '07706166725';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_link TEXT DEFAULT '07706166725';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS direct_phone TEXT DEFAULT '07706166725';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_secondary TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_link2 TEXT DEFAULT '';

-- السوشيال ميديا
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS facebook TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS facebook_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS instagram TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS instagram_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tiktok TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tiktok_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS youtube_link TEXT DEFAULT '';

-- الموقع الجغرافي والخرائط
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS address TEXT DEFAULT 'العراق - كركوك';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_address TEXT DEFAULT 'العراق - كركوك - احمد اغا - قرب الدفاع المدنى رابع متجر';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS map_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_map_link TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_maps_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_map_embed_url TEXT DEFAULT '';

-- التطبيقات والماسح الضوئي والثيمات
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS app_download_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS android_app_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ios_app_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS scanner_permissions JSONB DEFAULT '{"camera": true, "imageUpload": true, "manualEntry": true, "hardwareScanner": true, "adminGenerate": true}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS custom_themes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS active_theme_preset TEXT DEFAULT 'classic-blue';

-- الأيقونات والتذييل
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS home_icon TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS home_icon_size INTEGER DEFAULT 28;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS search_icon TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS search_icon_size INTEGER DEFAULT 28;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS cart_icon TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS cart_icon_size INTEGER DEFAULT 28;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_height INTEGER DEFAULT 120;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_right_text TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_center_text TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS footer_left_text TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS show_categories_carousel BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_delivery_fee NUMERIC DEFAULT 5000;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_delivery_duration TEXT DEFAULT '2 - 3 أيام عمل';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS watermark_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS role_themes JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS pricing_tiers JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS import_markup_pct NUMERIC DEFAULT 10;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS import_wholesale_reduction_pct NUMERIC DEFAULT 10;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_reply_threshold NUMERIC DEFAULT 0.90;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_reply_fallback TEXT DEFAULT 'شكراً لتواصلك معنا!';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS notification_sound_url TEXT DEFAULT '/sounds/chime.mp3';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS notification_volume NUMERIC DEFAULT 0.8;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_mute_duration INTEGER DEFAULT 1;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS customer_notification_categories JSONB DEFAULT '{"allowReplies": true, "allowOffers": true, "allowPosts": true}'::jsonb;

-- 2. إنعاش كاش PostgREST فورياً
NOTIFY pgrst, 'reload config';
