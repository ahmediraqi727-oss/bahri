-- =============================================================
-- Supabase SQL Migrations — Ahmed Bahri Store
-- Run this script in: Supabase → SQL Editor
-- NOTE: Uses "public.users" (not "profiles") — matches project schema
-- =============================================================

-- =============================================
-- 1. STORE LOCATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.store_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'متجر أحمد بحري',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  google_maps_url TEXT DEFAULT '',
  latitude NUMERIC(10, 7) DEFAULT NULL,
  longitude NUMERIC(10, 7) DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;

-- Anyone can read active locations
CREATE POLICY "Public can read store_locations"
  ON public.store_locations FOR SELECT
  TO public USING (is_active = true);

-- Only managers/admins can write (check via public.users table)
CREATE POLICY "Managers can manage store_locations"
  ON public.store_locations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('manager', 'admin')
    )
  );

-- Insert default store location (skip if already exists)
INSERT INTO public.store_locations (name, address, city, phone, google_maps_url)
SELECT 'متجر أحمد بحري', 'العراق', 'بغداد', '07800000000', 'https://maps.google.com/?q=33.3128,44.3615'
WHERE NOT EXISTS (SELECT 1 FROM public.store_locations LIMIT 1);

-- =============================================
-- 2. TEAM MEMBERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  job_title TEXT NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read visible team_members"
  ON public.team_members FOR SELECT
  TO public USING (is_visible = true);

CREATE POLICY "Managers can manage team_members"
  ON public.team_members FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('manager', 'admin')
    )
  );

-- =============================================
-- 3. POSTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  post_type TEXT NOT NULL DEFAULT 'promotional'
    CHECK (post_type IN ('educational', 'promotional')),
  display_position TEXT NOT NULL DEFAULT 'home_top'
    CHECK (display_position IN ('home_top', 'home_bottom', 'all_sections', 'category')),
  target_category TEXT DEFAULT NULL,
  media_url TEXT DEFAULT NULL,
  media_type TEXT DEFAULT 'image'
    CHECK (media_type IN ('image', 'video')),
  is_published BOOLEAN DEFAULT true,
  views_count INTEGER DEFAULT 0,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published posts"
  ON public.posts FOR SELECT
  TO public USING (is_published = true);

CREATE POLICY "Managers can manage posts"
  ON public.posts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('manager', 'admin')
    )
  );

-- =============================================
-- 4. POST COMMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT 'زائر',
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved comments
CREATE POLICY "Public can read approved comments"
  ON public.post_comments FOR SELECT
  TO public USING (is_approved = true);

-- Anyone (even anonymous) can post a comment
CREATE POLICY "Anyone can insert comments"
  ON public.post_comments FOR INSERT
  TO public WITH CHECK (true);

-- Managers can moderate (update/delete) comments
CREATE POLICY "Managers can manage comments"
  ON public.post_comments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('manager', 'admin')
    )
  );

-- =============================================
-- 5. POST REACTIONS TABLE (Likes / Dislikes)
-- =============================================
CREATE TABLE IF NOT EXISTS public.post_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  visitor_fingerprint TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id, visitor_fingerprint)
);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read reactions"
  ON public.post_reactions FOR SELECT TO public USING (true);

CREATE POLICY "Public can insert reactions"
  ON public.post_reactions FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Public can update reactions"
  ON public.post_reactions FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete reactions"
  ON public.post_reactions FOR DELETE TO public USING (true);

-- =============================================
-- 6. FUNCTION: Increment post views (safe RPC)
-- =============================================
CREATE OR REPLACE FUNCTION public.increment_post_views(post_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.posts
  SET views_count = views_count + 1
  WHERE id = post_id;
$$;
