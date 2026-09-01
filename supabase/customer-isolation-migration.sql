-- Migration: Customer Data Isolation & Handover Protocol
-- Description: Sets up public.user_favorites table, supports legacy public.favorites, ensures notifications broadcast column, and configures strict RLS.

-- 1. Create public.user_favorites Table
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_favorites_user_product_unique UNIQUE (user_id, product_id)
);

-- Index for high-performance customer filtering
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_product_id ON public.user_favorites(product_id);

-- 2. Legacy public.favorites view or table compatibility
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ensure Notifications Table Has is_broadcast Flag
ALTER TABLE IF EXISTS public.notifications ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_notifications_is_broadcast ON public.notifications(is_broadcast);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for user_favorites
DROP POLICY IF EXISTS "Users can view own favorites" ON public.user_favorites;
CREATE POLICY "Users can view own favorites" ON public.user_favorites
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own favorites" ON public.user_favorites;
CREATE POLICY "Users can insert own favorites" ON public.user_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own favorites" ON public.user_favorites;
CREATE POLICY "Users can delete own favorites" ON public.user_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Grants
GRANT ALL ON TABLE public.user_favorites TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_favorites TO anon;
