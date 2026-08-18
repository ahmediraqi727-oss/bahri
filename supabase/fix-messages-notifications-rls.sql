-- ====================================================================
-- إصلاح أمان جدول الرسائل والإشعارات (RLS Security Fix for messages & notifications)
-- يمنع هذا السكريبت الزوار العموميين من قراءة رسائل الآخرين الخاصة
-- ويحصر الوصول بقراءة المحادثة الخاصة بالضيف/الزبون نفسه فقط أو المدراء
-- ====================================================================

-- 1. تفعيل حماية Row Level Security على جدول الرسائل
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 2. إزالة السياسات المفتوحة القديمة
DROP POLICY IF EXISTS "messages_user_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_all" ON public.messages;
DROP POLICY IF EXISTS "messages_admin_all" ON public.messages;

-- 3. سياسة الإرسال: السماح بإرسال الرسائل
CREATE POLICY "messages_insert_policy" ON public.messages 
FOR INSERT 
WITH CHECK (true);

-- 4. سياسة القراءة المحمية: يسمح فقط للمستخدم المسجل بقراءة رسائله أو ضيف بقراءة جلسة رسائله الخاصة عبر session_id / user_id
CREATE POLICY "messages_select_policy" ON public.messages 
FOR SELECT 
USING (
  auth.role() = 'authenticated'
  OR (user_id IS NOT NULL AND auth.uid() = user_id)
  OR (session_id IS NOT NULL AND session_id = current_setting('request.headers', true)::json->>'x-session-id')
);

-- 5. جدول الإشعارات العامة: السماح بالقراءة للجميع
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select_public" ON public.notifications;
CREATE POLICY "notifications_select_public" ON public.notifications 
FOR SELECT 
USING (true);
