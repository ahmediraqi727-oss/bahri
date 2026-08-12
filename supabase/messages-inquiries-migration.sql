-- ==============================================================================
-- MASTER COMPREHENSIVE MIGRATION — AHMED BAHRI STORE (CLEAN & FIXED)
-- ==============================================================================

-- 1. التأكد من جدول profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'customer',
  full_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. جدول الرسائل
CREATE TABLE IF NOT EXISTS public.messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name   TEXT NOT NULL DEFAULT 'زائر',
  sender_phone  TEXT DEFAULT '',
  content       TEXT NOT NULL,
  is_admin_reply BOOLEAN NOT NULL DEFAULT FALSE,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  auto_replied  BOOLEAN NOT NULL DEFAULT FALSE,
  matched_keyword TEXT DEFAULT NULL,
  thread_id     UUID DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_read    ON public.messages(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id  ON public.messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id    ON public.messages(user_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_admin_all"   ON public.messages;
DROP POLICY IF EXISTS "messages_insert_all"  ON public.messages;
DROP POLICY IF EXISTS "messages_user_select" ON public.messages;

CREATE POLICY "messages_admin_all" ON public.messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "messages_insert_all" ON public.messages
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "messages_user_select" ON public.messages
  FOR SELECT
  USING (user_id = auth.uid() OR auth.uid() IS NOT NULL);

-- 3. جدول الاستفسارات (Inquiries)
CREATE TABLE IF NOT EXISTS public.inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL DEFAULT 'عام',
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  keywords    TEXT[] DEFAULT '{}',
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inquiries_public_read" ON public.inquiries;
DROP POLICY IF EXISTS "inquiries_admin_all"   ON public.inquiries;

CREATE POLICY "inquiries_public_read" ON public.inquiries
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "inquiries_admin_all" ON public.inquiries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('manager', 'admin')
    )
  );

-- 4. جدول الردود التلقائية (Auto Replies)
CREATE TABLE IF NOT EXISTS public.auto_replies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_keywords  TEXT[] NOT NULL DEFAULT '{}',
  response_text     TEXT NOT NULL,
  match_threshold   NUMERIC(4,2) NOT NULL DEFAULT 0.90 CHECK (match_threshold BETWEEN 0.0 AND 1.0),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  priority          INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.auto_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_replies_admin_all"   ON public.auto_replies;
DROP POLICY IF EXISTS "auto_replies_public_read" ON public.auto_replies;

CREATE POLICY "auto_replies_admin_all" ON public.auto_replies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "auto_replies_public_read" ON public.auto_replies
  FOR SELECT USING (is_active = TRUE);

-- 5. جدول الإشعارات (Notifications) مع تنظيف كافة السياسات القديمة منعاً لأي خطأ 42710
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT DEFAULT 'message',
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 1. حذف السياسات التي تعتمد على عمود type مؤقتاً
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_customer_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_public_customer_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_customer_strict_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_customer_safe_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;

-- 2. الآن بعد أن أزلنا الاعتمادية، قم بتحويل نوع عمود type إلى TEXT حر بنجاح تام
ALTER TABLE public.notifications 
ALTER COLUMN type TYPE TEXT USING type::TEXT;

-- 3. إعادة إنشاء سياسة الأدمن الكاملة
CREATE POLICY "notifications_admin_all" ON public.notifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('manager', 'admin')
    )
  );

-- 4. إعادة إنشاء سياسة الزبائن والضيوف الآمنة
CREATE POLICY "notifications_customer_safe_select" ON public.notifications
  FOR SELECT
  USING (
    user_id = auth.uid() 
    OR 
    (
      user_id IS NULL 
      AND (
        type IS NULL 
        OR type NOT IN ('low_stock', 'out_of_stock', 'admin_log', 'system', 'contact')
      )
    )
  );

-- 5. سياسة الإدراج المفتوحة
CREATE POLICY "notifications_insert_policy" ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- 6. الصلاحيات العامة للجداول
GRANT SELECT ON public.profiles TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.messages TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiries TO authenticated;
GRANT SELECT ON public.inquiries TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_replies TO authenticated;
GRANT SELECT ON public.auto_replies TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT ON public.notifications TO anon;

-- 7. إضافة عمودي session_id و serial_id للرسائل والإشعارات لتتبع الضيوف بدقة
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS serial_id TEXT;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS serial_id TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_serial_id ON public.messages(serial_id);
CREATE INDEX IF NOT EXISTS idx_notifications_session_id ON public.notifications(session_id);
CREATE INDEX IF NOT EXISTS idx_notifications_serial_id ON public.notifications(serial_id);

-- 8. دالة RPC لنقل وترقية كافة بيانات ورسائل الضيف إلى الحساب الرسمي الجديد عند التسجيل
CREATE OR REPLACE FUNCTION public.upgrade_guest_to_user(p_session_id TEXT, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- نقل الإشعارات المؤقتة إلى الحساب الرسمي الدائم
  UPDATE public.notifications
  SET user_id = p_user_id, session_id = NULL, serial_id = NULL
  WHERE (session_id = p_session_id OR serial_id = p_session_id) AND user_id IS NULL;

  -- نقل الرسائل المؤقتة إلى الحساب الرسمي الدائم
  UPDATE public.messages
  SET user_id = p_user_id, session_id = NULL, serial_id = NULL, is_guest = FALSE
  WHERE (session_id = p_session_id OR serial_id = p_session_id OR sender_phone = p_session_id) AND user_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upgrade_guest_to_user(TEXT, UUID) TO authenticated, anon;

-- 9. دالة تنظيف وتصفية بيانات وإشعارات الضيوف المنتهية الصلاحية (أكثر من 24 ساعة)
CREATE OR REPLACE FUNCTION public.cleanup_expired_guest_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- حذف الرسائل المؤقتة للضيوف غير المسجلين التي تجاوزت 24 ساعة
  DELETE FROM public.messages
  WHERE user_id IS NULL
    AND (serial_id IS NOT NULL OR session_id IS NOT NULL)
    AND created_at < NOW() - INTERVAL '24 hours';

  -- حذف الإشعارات المؤقتة للضيوف غير المسجلين التي تجاوزت 24 ساعة
  DELETE FROM public.notifications
  WHERE user_id IS NULL
    AND (serial_id IS NOT NULL OR session_id IS NOT NULL)
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_guest_data() TO authenticated, anon;

-- 10. تحديث ذاكرة التخزين المؤقت للخادم
NOTIFY pgrst, 'reload schema';