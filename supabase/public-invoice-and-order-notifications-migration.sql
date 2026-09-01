-- ==============================================================================
-- 1. التأكد من وجود أعمدة الفاتورة وتوافقها التام
-- ==============================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_serial TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS governorate TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'واتساب';

-- إنشاء فهرس سريع للبحث برقم الفاتورة
CREATE INDEX IF NOT EXISTS idx_orders_invoice_serial ON public.orders(invoice_serial);

-- ==============================================================================
-- 2. ضبط سياسات RLS للسماح بقراءة الفاتورة عبر رابطها العام
-- ==============================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read orders for invoice view" ON public.orders;
CREATE POLICY "Public read orders for invoice view" 
ON public.orders FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
CREATE POLICY "Public insert orders" 
ON public.orders FOR INSERT 
WITH CHECK (true);

-- ==============================================================================
-- 3. تفعيل إشعار الجرس الفوري للإدارة مع الصوت
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.notify_admin_on_order_created()
RETURNS TRIGGER AS $$
DECLARE
    inv_num TEXT;
    c_name TEXT;
    c_phone TEXT;
    tot_val TEXT;
BEGIN
    inv_num := COALESCE(NEW.invoice_serial, 'INV-2026-' || LPAD(NEW.serial_number::text, 4, '0'));
    c_name := COALESCE(NEW.customer_name, 'زبون');
    c_phone := COALESCE(NEW.customer_phone, '');
    tot_val := COALESCE(NEW.total::text, '0');

    INSERT INTO public.notifications (
        type,
        title,
        message,
        is_broadcast,
        read,
        created_at
    ) VALUES (
        'order',
        '🛒 فاتورة طلب شراء جديدة #' || inv_num,
        'فاتورة جديدة للزبون (' || c_name || ' - ' || c_phone || ') بقيمة: ' || tot_val || ' د.ع',
        true,
        false,
        now()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_order_insert ON public.orders;
CREATE TRIGGER trg_notify_order_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_on_order_created();

NOTIFY pgrst, 'reload config';
