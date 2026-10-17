-- =============================================================================
-- متجر أحمد بحري (Ahmed Bahri Store)
-- ترقية نظام المخزون، وجبات الاستيراد (batch_stock)، وإعدادات عرض المنتجات النافدة
-- تاريخ التحديث: 2026
-- =============================================================================

BEGIN;

-- 1. إضافة عمود إجمالي كمية الاستيراد / الوجبة (batch_stock) إلى جدول المنتجات
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS batch_stock INTEGER NOT NULL DEFAULT 0;

-- 2. تهيئة قيمة batch_stock للمنتجات الحالية لتساوي على الأقل الكمية المتوفرة حالياً
UPDATE public.products
SET batch_stock = GREATEST(COALESCE(stock, 0), COALESCE(batch_stock, 0))
WHERE batch_stock < COALESCE(stock, 0) OR batch_stock IS NULL;

-- 3. إضافة عمود سياسة عرض المنتجات النافدة (out_of_stock_visibility) إلى جدول الإعدادات
-- القيم المدعومة: 'everyone' (للجميع) | 'staff_only' (للمدير والإدارة) | 'none' (عدم عرض)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS out_of_stock_visibility TEXT NOT NULL DEFAULT 'staff_only';

-- 4. إضافة قيد تحقق (Check Constraint) لضمان صحة القيم المدخلة في الإعدادات
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_out_of_stock_visibility_check'
  ) THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_out_of_stock_visibility_check
      CHECK (out_of_stock_visibility IN ('everyone', 'staff_only', 'none'));
  END IF;
END $$;

-- 5. دالة وتريجر (Trigger) للمزامنة الذكية بين الكمية المتوفرة (stock) وكمية الوجبة (batch_stock)
CREATE OR REPLACE FUNCTION public.fn_sync_product_batch_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- التأكد من عدم قبول قيم سالبة للكمية
  NEW.stock := GREATEST(COALESCE(NEW.stock, 0), 0);

  -- عند الإدخال الجديد: إذا لم تُحدد كمية الوجبة أو كانت أقل من الكمية المتوفرة، تُضبط تلقائياً
  IF TG_OP = 'INSERT' THEN
    NEW.batch_stock := GREATEST(COALESCE(NEW.batch_stock, 0), NEW.stock);
  ELSE
    -- عند التحديث: إذا زادت الكمية المتوفرة عن إجمالي الوجبة المسجلة، يتم رفع سقف الوجبة تلقائياً
    NEW.batch_stock := GREATEST(COALESCE(NEW.batch_stock, OLD.batch_stock, 0), NEW.stock);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_batch_stock ON public.products;

CREATE TRIGGER trg_sync_product_batch_stock
BEFORE INSERT OR UPDATE OF stock, batch_stock ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_product_batch_stock();

-- 6. إنشاء فهارس (Indexes) لتسريع فرز المنتجات النافدة والمنخفضة في لوحة المخزون والمتجر
CREATE INDEX IF NOT EXISTS idx_products_out_of_stock_priority
  ON public.products ((stock <= 0) DESC, stock ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_stock_ratio
  ON public.products (stock, batch_stock);

COMMIT;
