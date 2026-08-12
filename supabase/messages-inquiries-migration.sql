-- ==============================================================================
-- MESSAGES HUB MIGRATION — AHMED BAHRI STORE (FIXED)
-- ==============================================================================

-- تأكد من وجود جدول profiles أو إنشاء جدول أساسي لربط الأدوار إن لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'customer',
  full_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 1. messages table ─────────────────────────────────────────────────────────
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

-- ── 2. inquiries table ────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_inquiries_category   ON public.inquiries(category);
CREATE INDEX IF NOT EXISTS idx_inquiries_sort_order ON public.inquiries(sort_order);

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

-- ── 3. auto_replies table ─────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_auto_replies_is_active ON public.auto_replies(is_active);
CREATE INDEX IF NOT EXISTS idx_auto_replies_priority  ON public.auto_replies(priority DESC);

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

-- ── 4. Global auto-reply & notification toggles in settings ─────────────────────
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'settings') THEN
    ALTER TABLE public.settings
      ADD COLUMN IF NOT EXISTS auto_reply_enabled              BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS auto_reply_threshold            NUMERIC(4,2) DEFAULT 0.90,
      ADD COLUMN IF NOT EXISTS auto_reply_fallback             TEXT DEFAULT 'شكراً لتواصلك معنا! سيتم الرد عليك من قبل فريقنا في أقرب وقت ممكن.',
      ADD COLUMN IF NOT EXISTS notification_sound_url          TEXT DEFAULT '/sounds/chime.mp3',
      ADD COLUMN IF NOT EXISTS notification_volume             NUMERIC(3,2) DEFAULT 0.80,
      ADD COLUMN IF NOT EXISTS default_mute_duration           INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS customer_notification_categories JSONB DEFAULT '{"allowReplies":true,"allowOffers":true,"allowPosts":true}';
  END IF;
END $$;

-- ── 5. SEED DATA — Inquiries ──────────────────────────────────────────────────
INSERT INTO public.inquiries (category, question, answer, keywords, sort_order) VALUES
('طرق الشراء', 'كيف يمكنني الشراء من المتجر؟', 'يمكنك الشراء بطريقتين: عبر الموقع الإلكتروني (أضف للسلة وأكمل الطلب) أو عبر واتساب مباشرة. الدفع يكون عند الاستلام أو بالتحويل المصرفي مسبقاً.', ARRAY['شراء','طلب','كيف','اطلب'], 1),
('طرق الشراء', 'ما هي طرق الدفع المتاحة؟', 'نقبل: الدفع عند الاستلام (كاش)، تحويل بنكي مسبق، زين كاش، آسياسيل كاش. الدفع المسبق يمنحك أولوية في التجهيز.', ARRAY['دفع','كاش','تحويل','payment'], 2),
('قواعد السلة', 'كم الحد الأدنى للطلب؟', 'لا يوجد حد أدنى — يمكنك طلب قطعة واحدة. الطلبات بكميات أكبر تستفيد من خصومات الجملة التلقائية.', ARRAY['حد أدنى','قطعة','كمية'], 3),
('قواعد السلة', 'هل يمكنني تعديل أو إلغاء طلبي؟', 'يمكن تعديل أو إلغاء الطلب قبل تأكيد الشحن. بعد الشحن لا يمكن الإلغاء. تواصل معنا فوراً عبر واتساب.', ARRAY['تعديل','إلغاء','cancel'], 4),
('المنتجات', 'هل المنتجات أصلية ومضمونة؟', 'نعم، جميع منتجاتنا أصلية 100% ومستوردة من مصادر موثوقة. نقبل الإرجاع خلال 7 أيام من الاستلام في حال وجود عيب مصنعي.', ARRAY['أصلي','ضمان','جودة','warranty'], 5),
('المنتجات', 'ما هي فئات المنتجات المتوفرة؟', 'إلكترونيات، إكسسوارات، منتجات منزلية، قطع غيار، ومواد متنوعة. تصفح أقسامنا للاطلاع على الكتالوج الكامل.', ARRAY['منتجات','فئات','أقسام'], 6),
('حسابات المستخدمين', 'كيف أنشئ حساباً جديداً؟', 'انقر "تسجيل الدخول" في أعلى الصفحة وأدخل بريدك الإلكتروني وكلمة مرور. بعد التفعيل تستطيع تتبع طلباتك وإدارة مفضلتك.', ARRAY['حساب','تسجيل','اشتراك'], 7),
('الأسعار والخصومات', 'ما الفرق بين سعر الجملة وسعر المفرد؟', 'سعر المفرد للقطعة الواحدة. سعر الجملة يُطبق تلقائياً عند شراء كميات أكبر — كلما زادت الكمية انخفض سعر الوحدة. الخصومات تُحسب تلقائياً في السلة.', ARRAY['جملة','مفرد','خصم','سعر','wholesale'], 8),
('الأسعار والخصومات', 'كيف يُحسب الخصم التلقائي على الكميات؟', 'نظام التسعير التلقائي: قطعة واحدة = السعر الأساسي، 2-5 قطع = خصم خاص، 6-10 قطع = خصم أعلى، 11+ قطعة = أقصى خصم جملة. يظهر الخصم لحظياً عند تغيير الكمية.', ARRAY['خصم','كمية','تلقائي','تسعير'], 9),
('التوصيل والشحن', 'ما هي مناطق التوصيل وكم يستغرق؟', 'نوصل لجميع محافظات العراق: بغداد خلال 24 ساعة، المحافظات القريبة 2-3 أيام، المناطق النائية 3-5 أيام. رسوم التوصيل تُحسب حسب المنطقة.', ARRAY['توصيل','شحن','وقت','محافظة'], 10),
('التوصيل والشحن', 'هل التوصيل مجاني؟', 'التوصيل مجاني على الطلبات التي تتجاوز حداً معيناً (يُعلن عنه في العروض). للطلبات العادية رسوم رمزية تبدأ من 5,000 دينار حسب المنطقة.', ARRAY['مجاني','توصيل','رسوم'], 11),
('معلومات المتجر', 'أين يقع المتجر؟', 'يقع متجرنا في بغداد. اضغط على "موقعنا على الخريطة" في القائمة للوصول الفوري. للزيارة يُنصح بالتنسيق مسبقاً عبر واتساب.', ARRAY['موقع','عنوان','بغداد','location'], 12),
('المنتجات', 'هل تتوفر قطع غيار وأجزاء تقنية؟', 'نعم، نتخصص في توفير قطع الغيار والمواد التقنية. أرسل لنا صورة أو اسم القطعة عبر واتساب وسنتحقق من التوفر فوراً.', ARRAY['قطع غيار','أجزاء','spare parts'], 13)
ON CONFLICT DO NOTHING;

-- ── 6. SEED DATA — Auto Replies ───────────────────────────────────────────────
INSERT INTO public.auto_replies (trigger_keywords, response_text, match_threshold, priority) VALUES
(ARRAY['مرحبا','هلو','السلام','hello','hi','اهلا'], 'أهلاً وسهلاً! 👋 مرحباً بك في متجر أحمد بحري. كيف يمكننا مساعدتك اليوم؟', 0.90, 5),
(ARRAY['سعر','كم سعر','بكم','price','ثمن'], 'أسعارنا تنافسية وتعتمد على الكمية 😊 يمكنك مشاهدة السعر الكامل مباشرة على بطاقة كل منتج في الموقع.', 0.85, 10),
(ARRAY['توصيل','شحن','متى يوصل','delivery','shipping'], 'نوصل لجميع محافظات العراق! 🚚 بغداد: 24 ساعة | المحافظات: 2-3 أيام | المناطق البعيدة: 3-5 أيام.', 0.85, 9),
(ARRAY['طلب','كيف اطلب','شراء','اشترى','order','buy'], 'للطلب: أضف المنتج للسلة وأكمل الطلب من الموقع، أو تواصل معنا عبر واتساب وسنساعدك شخصياً 💬', 0.85, 8),
(ARRAY['ضمان','إرجاع','استبدال','warranty','return'], 'نضمن جودة جميع منتجاتنا ✅ نقبل الإرجاع خلال 7 أيام من الاستلام في حال وجود عيب مصنعي.', 0.85, 7),
(ARRAY['دفع','تحويل','كاش','payment','pay','زين كاش'], 'طرق الدفع: 💵 الدفع عند الاستلام | 🏦 تحويل بنكي | 📱 زين كاش / آسياسيل كاش', 0.85, 6)
ON CONFLICT DO NOTHING;


-- ── 7. STRICT NOTIFICATIONS RLS SECURITY ───────────────────────────────────────
-- Fixes permission leak where customers could view internal admin logs & other users' support tickets
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_customer_select" ON public.notifications;

-- Admins and Managers can view and manage all notifications
CREATE POLICY "notifications_admin_all" ON public.notifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('manager', 'admin')
    )
  );

-- Customers and Guests can ONLY select non-admin notification categories
-- and ONLY notifications tied to their own user_id OR public broadcasts (user_id IS NULL)
CREATE POLICY "notifications_customer_select" ON public.notifications
  FOR SELECT
  USING (
    (user_id = auth.uid() OR user_id IS NULL)
    AND type NOT IN ('low_stock', 'out_of_stock', 'contact', 'admin_log', 'system')
  );