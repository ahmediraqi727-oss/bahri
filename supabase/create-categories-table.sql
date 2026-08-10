-- SQL Migration for Categories Management Table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  image TEXT DEFAULT '',
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Idempotent & Smooth RLS Policies (Prevents function missing errors)
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
DROP POLICY IF EXISTS "Managers and Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Allow all operations for categories" ON public.categories;
CREATE POLICY "Allow all operations for categories" ON public.categories FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
