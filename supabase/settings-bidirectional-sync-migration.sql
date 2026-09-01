-- ==============================================================================
-- Supabase Schema Migration: Settings Table Bidirectional Sync Columns
-- ==============================================================================

-- 1. Ensure all columns in the Settings Audit Matrix exist on public.settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_name TEXT DEFAULT 'متجر أحمد بحري';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS store_address TEXT DEFAULT 'العراق - كركوك';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_maps_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_primary TEXT DEFAULT '07800000000';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone_secondary TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS facebook TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS instagram TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tiktok TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS android_app_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ios_app_url TEXT DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS scanner_permissions JSONB DEFAULT '{"camera": true, "imageUpload": true, "manualEntry": true, "hardwareScanner": true, "adminGenerate": true}'::jsonb;

-- 2. Backfill fallback columns if primary column exists but secondary is null
UPDATE public.settings
SET
  store_name = COALESCE(NULLIF(store_name, ''), NULLIF(site_name, ''), 'متجر أحمد بحري'),
  store_address = COALESCE(NULLIF(store_address, ''), NULLIF(address, ''), 'العراق - كركوك'),
  google_maps_url = COALESCE(NULLIF(google_maps_url, ''), NULLIF(store_map_link, ''), NULLIF(map_url, ''), ''),
  phone_primary = COALESCE(NULLIF(phone_primary, ''), NULLIF(phone_link, ''), NULLIF(direct_phone, ''), '07800000000'),
  phone_secondary = COALESCE(NULLIF(phone_secondary, ''), NULLIF(phone_link2, ''), ''),
  whatsapp = COALESCE(NULLIF(whatsapp, ''), NULLIF(whatsapp_link, ''), NULLIF(whatsapp_number, ''), ''),
  facebook = COALESCE(NULLIF(facebook, ''), NULLIF(facebook_link, ''), ''),
  instagram = COALESCE(NULLIF(instagram, ''), NULLIF(instagram_link, ''), ''),
  tiktok = COALESCE(NULLIF(tiktok, ''), NULLIF(tiktok_link, ''), '');
