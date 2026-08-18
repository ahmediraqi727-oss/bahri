-- ====================================================================
-- إصلاح أمان جدول الطلبات (RLS Security Fix for orders table)
-- يمنع هذا السكريبت الضيوف (anon) من قراءة كافة الطلبات في قاعدة البيانات
-- بينما يسمح لهم بإضافة طلبات جديدة فقط (INSERT)
-- ====================================================================

-- 1. تفعيل حماية Row Level Security على جدول الطلبات
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 2. إزالة السياسات القديمة المشتركة أو التي تسمح بالوصول الشامل للضيوف
DROP POLICY IF EXISTS "Allow all operations on orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Managers and Admins can view orders" ON public.orders;
DROP POLICY IF EXISTS "Managers and Admins can update orders" ON public.orders;

-- 3. السماح لأي زائر/ضيف بإنشاء طلب جديد فقط (INSERT)
CREATE POLICY "Anyone can create orders" 
ON public.orders FOR INSERT 
WITH CHECK (true);

-- 4. حصر قراءة الطلبات (SELECT) للمدراء والمصرح لهم فقط
CREATE POLICY "Managers and Admins can view orders" 
ON public.orders FOR SELECT 
USING (
  auth.role() = 'authenticated'
);

-- 5. حصر تعديل الطلبات (UPDATE) للمدراء والمصرح لهم فقط
CREATE POLICY "Managers and Admins can update orders" 
ON public.orders FOR UPDATE 
USING (
  auth.role() = 'authenticated'
);
