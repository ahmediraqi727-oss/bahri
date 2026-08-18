-- ====================================================================
-- Consolidated RLS Security & User Data Isolation Migration
-- Project: Ahmed Bahri Store (قطع غيار الجبالي)
-- ====================================================================

-- 1. التأكد من وجود عمود user_id في جميع الجداول لتجنب أي نقص في الـ Schema
ALTER TABLE IF EXISTS public.messages ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE IF EXISTS public.messages ADD COLUMN IF NOT EXISTS session_id TEXT;

ALTER TABLE IF EXISTS public.notifications ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE IF EXISTS public.favorites ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. تفعيل الحماية والـ RLS على جداول النظام
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;

-- 3. إزالة أي سياسات قديمة متعارضة
DROP POLICY IF EXISTS "Isolated messages access" ON public.messages;
DROP POLICY IF EXISTS "Isolated notifications access" ON public.notifications;
DROP POLICY IF EXISTS "Isolated favorites access" ON public.favorites;
DROP POLICY IF EXISTS "Isolated orders access" ON public.orders;

-- 4. سياسة الرسائل: الزبون يرى رسائله فقط
CREATE POLICY "Isolated messages access" ON public.messages
FOR ALL USING (
  auth.uid() = user_id 
  OR session_id = current_setting('request.jwt.claim.sub', true)
);

-- 5. سياسة الإشعارات: الزبون يرى إشعاراته الموجهة له فقط والنشرات العامة
CREATE POLICY "Isolated notifications access" ON public.notifications
FOR SELECT USING (
  auth.uid() = user_id 
  OR user_id IS NULL
);

-- 6. سياسة المفضلة: الزبون يرى مفضلته الخاصة فقط
CREATE POLICY "Isolated favorites access" ON public.favorites
FOR ALL USING (auth.uid() = user_id);

-- 7. سياسة المشتريات (منتجاتي): الزبون يرى طلباته ومشترياته فقط
CREATE POLICY "Isolated orders access" ON public.orders
FOR SELECT USING (auth.uid() = user_id);
