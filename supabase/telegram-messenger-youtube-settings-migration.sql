-- ==============================================================================
-- Migration: Add Telegram, Messenger, and YouTube links to Settings Table
-- ==============================================================================

-- 1. إضافة حقول التليجرام والماسنجر وقناة اليوتيوب لجدول الإعدادات
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS telegram_link TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS messenger_link TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS youtube_link TEXT DEFAULT '';

-- 2. تحديث السجل الحالي بالقيم الافتراضية إن كانت فارغة
UPDATE public.settings 
SET 
  telegram_link = COALESCE(telegram_link, ''),
  messenger_link = COALESCE(messenger_link, ''),
  youtube_link = COALESCE(youtube_link, '')
WHERE id IS NOT NULL;

-- 3. إنعاش كاش PostgREST ليتعرف السيرفر على الأعمدة الجديدة فوراً
NOTIFY pgrst, 'reload config';
