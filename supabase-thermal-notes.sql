-- ==============================================================================
-- Ahmed Bahri Store - Thermal Footer Notes Table & RLS Policies (Supabase SQL)
-- جدول حفظ ملاحظات ونصوص تذييل الملصقات الحرارية لاستوديو الملصقات
-- ==============================================================================

-- 1. إنشاء جدول الملاحظات الحرارية
CREATE TABLE IF NOT EXISTS public.thermal_footer_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_text TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. إنشاء الفهارس لتسريع الاستعلام والفرز
CREATE INDEX IF NOT EXISTS idx_thermal_footer_notes_created_at ON public.thermal_footer_notes(created_at DESC);

-- 3. تفعيل أمان مستوى الصف (Row Level Security - RLS)
ALTER TABLE public.thermal_footer_notes ENABLE ROW LEVEL SECURITY;

-- 4. سياسات الوصول (RLS Policies)
-- السماح بقراءة الملاحظات للجميع (للمصادق عليهم والزوار لاستخدام الملصقات)
DROP POLICY IF EXISTS "Allow public read access to thermal_footer_notes" ON public.thermal_footer_notes;
CREATE POLICY "Allow public read access to thermal_footer_notes"
ON public.thermal_footer_notes
FOR SELECT
USING (true);

-- السماح بإضافة ملاحظات جديدة
DROP POLICY IF EXISTS "Allow insert access to thermal_footer_notes" ON public.thermal_footer_notes;
CREATE POLICY "Allow insert access to thermal_footer_notes"
ON public.thermal_footer_notes
FOR INSERT
WITH CHECK (true);

-- السماح بتحديث الملاحظات
DROP POLICY IF EXISTS "Allow update access to thermal_footer_notes" ON public.thermal_footer_notes;
CREATE POLICY "Allow update access to thermal_footer_notes"
ON public.thermal_footer_notes
FOR UPDATE
USING (true)
WITH CHECK (true);

-- السماح بحذف الملاحظات
DROP POLICY IF EXISTS "Allow delete access to thermal_footer_notes" ON public.thermal_footer_notes;
CREATE POLICY "Allow delete access to thermal_footer_notes"
ON public.thermal_footer_notes
FOR DELETE
USING (true);

-- 5. إدراج الملاحظات الافتراضية الأولية لمتجر أحمد بحري
INSERT INTO public.thermal_footer_notes (note_text, is_default)
VALUES 
    ('معرض أحمد بحري', true),
    ('معرض أحمد بحري - قطع غيار السيارات الأصلية', false),
    ('معرض أحمد بحري - ضمان الجودة والفحص الفني', false),
    ('بضاعة مباعة لا ترد ولا تستبدل بعد 3 أيام', false),
    ('خدمة العملاء والاستفسارات: 07700000000', false),
    ('ملاحظة: السعر شامل الضريبة والمطابقة الفنية', false)
ON CONFLICT DO NOTHING;
