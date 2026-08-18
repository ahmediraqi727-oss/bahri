-- ====================================================================
-- Enterprise Customer Hub, Notifications & Favorites RLS Security Migration
-- Project: Ahmed Bahri Store (قطع غيار الجبالي)
-- ====================================================================

-- 1. Ensure public.favorites table exists for registered customer wishlists
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_product_favorite UNIQUE (user_id, product_id)
);

-- 2. Ensure public.notifications table exists for admin broadcasts & personal alerts
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL means global broadcast
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'offer', -- 'offer' | 'post' | 'system'
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure missing columns are added if tables already existed
ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS product_id TEXT;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'offer';

-- 3. Create high-performance indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_product_id ON public.favorites(product_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- 4. Enable Row Level Security (RLS) on favorites and notifications
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 5. Clean up old permissive policies
DROP POLICY IF EXISTS "favorites_user_all" ON public.favorites;
DROP POLICY IF EXISTS "favorites_select_own" ON public.favorites;
DROP POLICY IF EXISTS "notifications_public_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;

-- 6. RLS Policies for Favorites (Wishlist Isolation)
CREATE POLICY "Customer Own Favorites SELECT Policy" ON public.favorites
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);

CREATE POLICY "Customer Own Favorites INSERT Policy" ON public.favorites
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY "Customer Own Favorites DELETE Policy" ON public.favorites
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
);

-- 7. RLS Policies for Notifications (Broadcasts & User Alerts)
CREATE POLICY "Public Broadcast & Own Notifications SELECT Policy" ON public.notifications
FOR SELECT
TO authenticated, anon, public
USING (
  user_id IS NULL OR user_id = auth.uid()
);

CREATE POLICY "Admin Notifications Management Policy" ON public.notifications
FOR ALL
TO authenticated
USING (
  auth.role() = 'authenticated'
)
WITH CHECK (
  auth.role() = 'authenticated'
);

-- 8. Grant Table Privileges
GRANT ALL ON TABLE public.favorites TO authenticated;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT SELECT ON TABLE public.notifications TO anon, public;
