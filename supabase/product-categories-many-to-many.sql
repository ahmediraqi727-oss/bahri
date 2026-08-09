-- ==============================================================================
-- Migration: Setup Unique Constraints and Many-to-Many product_categories Table
-- Project: أحمد بحري Store Dashboard
-- ==============================================================================

-- 1. Ensure categories table has unique constraint on name for Upsert operations
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE categories ADD CONSTRAINT categories_name_key UNIQUE (name);

-- 2. Ensure products table has unique constraint on name for Upsert operations
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_name_key;
ALTER TABLE products ADD CONSTRAINT products_name_key UNIQUE (name);

-- 3. Ensure Many-to-Many product_categories junction table exists with composite primary key
CREATE TABLE IF NOT EXISTS product_categories (
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

-- Enable RLS and grant access policies for public/authenticated/anon access
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users on product_categories" ON product_categories;
CREATE POLICY "Allow all for authenticated users on product_categories"
  ON product_categories FOR ALL
  TO authenticated, anon, service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.product_categories TO anon, authenticated, service_role;
