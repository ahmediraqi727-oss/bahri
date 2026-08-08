-- ==============================================================================
-- موقع أحمد بحري - إصلاح وتحديث سياسات الأمان (Supabase RLS Policies)
-- شغّل هذا الملف في Supabase SQL Editor لحل مشكلة استرجاع أو حذف السلة
-- ==============================================================================

-- 1. جدول سلة المهملات (trash) - تفعيل السياسات للسماح بكافة العمليات
ALTER TABLE IF EXISTS public.trash ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on trash" ON public.trash;
DROP POLICY IF EXISTS "Allow all access to trash" ON public.trash;
DROP POLICY IF EXISTS "Managers and Admins can manage trash" ON public.trash;
DROP POLICY IF EXISTS "Anyone can view trash" ON public.trash;

CREATE POLICY "Allow all operations on trash"
ON public.trash
FOR ALL
TO public, authenticated, anon
USING (true)
WITH CHECK (true);

-- 2. جدول المنتجات (products) - السماح بالحذف والاستعادة والتحديث
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on products" ON public.products;
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
DROP POLICY IF EXISTS "Managers and Admins can manage products" ON public.products;

CREATE POLICY "Allow all operations on products"
ON public.products
FOR ALL
TO public, authenticated, anon
USING (true)
WITH CHECK (true);

-- 3. جدول الأقسام (categories) - السماح بالإدراج والتحديث والتناغم
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on categories" ON public.categories;

CREATE POLICY "Allow all operations on categories"
ON public.categories
FOR ALL
TO public, authenticated, anon
USING (true)
WITH CHECK (true);

-- 4. جدول الموردين (suppliers) - السماح بالإدراج والتحديث والمسح
ALTER TABLE IF EXISTS public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on suppliers" ON public.suppliers;

CREATE POLICY "Allow all operations on suppliers"
ON public.suppliers
FOR ALL
TO public, authenticated, anon
USING (true)
WITH CHECK (true);

-- 5. جدول الطلبات (orders)
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on orders" ON public.orders;

CREATE POLICY "Allow all operations on orders"
ON public.orders
FOR ALL
TO public, authenticated, anon
USING (true)
WITH CHECK (true);

-- 6. جدول العملاء (customers)
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on customers" ON public.customers;

CREATE POLICY "Allow all operations on customers"
ON public.customers
FOR ALL
TO public, authenticated, anon
USING (true)
WITH CHECK (true);
