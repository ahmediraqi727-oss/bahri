-- ============================================================================
-- SUPABASE SQL MIGRATION: SETUP & OPTIMIZE CATEGORIES TABLE SCHEMA
-- ============================================================================

-- 1. Create categories table if not exists with all required fields
CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text UNIQUE NOT NULL,
  image text DEFAULT '',
  priority integer DEFAULT 1,
  display_order integer DEFAULT 1,
  sort_order integer DEFAULT 1,
  keywords text DEFAULT '',
  is_active boolean DEFAULT true,
  views_count integer DEFAULT 0,
  created_at timestamptz DEFAULT timezone('utc'::text, now())
);

-- 2. Create High-Speed Indexes on name and priority
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_categories_priority ON categories(priority ASC);

-- 3. Enable RLS and Create Permissive RLS Policies for Categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Categories" ON categories;
CREATE POLICY "Public Read Categories" ON categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Categories" ON categories;
CREATE POLICY "Public Insert Categories" ON categories FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Update Categories" ON categories;
CREATE POLICY "Public Update Categories" ON categories FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public Delete Categories" ON categories;
CREATE POLICY "Public Delete Categories" ON categories FOR DELETE USING (true);
