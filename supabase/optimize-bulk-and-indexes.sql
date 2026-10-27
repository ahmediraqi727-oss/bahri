-- =================================================================================
-- Ahmed Bahri Store — High-Performance Storefront Feed, Category & Search SQL Suite
-- =================================================================================

-- 0. Enable PostgreSQL Trigram Extension for Fast Arabic & Partial Text Searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Ensure Required Storefront, Category & Image Columns Exist on Products Table
ALTER TABLE IF EXISTS products
  ADD COLUMN IF NOT EXISTS original_image_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS category_name text,
  ADD COLUMN IF NOT EXISTS is_all_categories boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS batch_stock integer DEFAULT 0;

-- 2. Immutable Arabic Normalization Helper (Unifies أ/إ/آ -> ا, ة -> ه, ى -> ي)
CREATE OR REPLACE FUNCTION normalize_arabic_text(input_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    translate(
      COALESCE(btrim(input_text), ''),
      'أإآٱةىیئؤکگ',
      'اااااهيييوكك'
    )
  );
$$;

-- 3. High-Performance Composite & Trigram Indexes for Instant Storefront & Category Pagination
CREATE INDEX IF NOT EXISTS idx_products_id ON products(id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_pagination_cursor ON products(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_products_stock_created_at ON products(stock, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_category_name ON products(category_name);
CREATE INDEX IF NOT EXISTS idx_products_is_all_categories ON products(is_all_categories);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- Trigram GIN Indexes for Instant Multi-Token, Category & Fuzzy Search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_notes_trgm ON products USING gin (notes gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_category_name_trgm ON products USING gin (category_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm ON products USING gin (barcode gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_categories_priority ON categories(priority ASC);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

CREATE INDEX IF NOT EXISTS idx_trash_id ON trash(id);
CREATE INDEX IF NOT EXISTS idx_trash_entity_id ON trash(entity_id);
CREATE INDEX IF NOT EXISTS idx_trash_entity ON trash(entity);
CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash(deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_id ON orders(id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 4. Foreign Key ON DELETE SET NULL Optimization
ALTER TABLE IF EXISTS products
  DROP CONSTRAINT IF EXISTS fk_products_supplier,
  ADD CONSTRAINT fk_products_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  ON DELETE SET NULL;

-- 5. Primary Storefront & Category Chunked Feed RPC (`get_storefront_products`)
--    - Cleanly handles NULL or empty p_category and p_search_query on initial load
--    - Supports Arabic orthographic normalization (ه/ة, أ/إ/ا) for categories & search
--    - Includes product `image` and `thumbnail_url` directly in the initial payload
CREATE OR REPLACE FUNCTION get_storefront_products(
  p_limit integer DEFAULT 40,
  p_offset integer DEFAULT 0,
  p_category text DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_include_out_of_stock boolean DEFAULT true
)
RETURNS SETOF products
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      NULLIF(btrim(COALESCE(p_category, '')), '') AS raw_cat,
      normalize_arabic_text(NULLIF(btrim(COALESCE(p_category, '')), '')) AS norm_cat,
      NULLIF(btrim(COALESCE(p_search_query, '')), '') AS raw_q,
      normalize_arabic_text(NULLIF(btrim(COALESCE(p_search_query, '')), '')) AS norm_q
  )
  SELECT p.*
  FROM products p
  CROSS JOIN params prm
  WHERE
    -- Stock visibility filter
    (p_include_out_of_stock OR COALESCE(p.stock, 0) > 0)
    -- Clean Category filter (skipped completely on initial homepage load when raw_cat IS NULL or 'الكل')
    AND (
      prm.raw_cat IS NULL
      OR prm.raw_cat = 'الكل'
      OR COALESCE(p.is_all_categories, false) = true
      OR p.category_id::text = prm.raw_cat
      OR COALESCE(p.notes, '') ILIKE '%جميع الاقسام%'
      OR COALESCE(p.notes, '') ILIKE '%جميع الأقسام%'
      OR COALESCE(p.category_name, '') ILIKE '%' || prm.raw_cat || '%'
      OR COALESCE(p.notes, '') ILIKE '%' || prm.raw_cat || '%'
      OR normalize_arabic_text(COALESCE(p.category_name, '')) LIKE '%' || prm.norm_cat || '%'
      OR normalize_arabic_text(COALESCE(p.notes, '')) LIKE '%' || prm.norm_cat || '%'
    )
    -- Clean Search filter (skipped completely when raw_q IS NULL)
    AND (
      prm.raw_q IS NULL
      OR p.name ILIKE '%' || prm.raw_q || '%'
      OR COALESCE(p.notes, '') ILIKE '%' || prm.raw_q || '%'
      OR COALESCE(p.barcode, '') ILIKE '%' || prm.raw_q || '%'
      OR normalize_arabic_text(p.name) LIKE '%' || prm.norm_q || '%'
      OR normalize_arabic_text(COALESCE(p.notes, '')) LIKE '%' || prm.norm_q || '%'
      OR similarity(p.name, prm.raw_q) > 0.22
    )
  ORDER BY
    CASE
      WHEN prm.raw_q IS NOT NULL AND p.name ILIKE prm.raw_q || '%' THEN 0
      WHEN prm.raw_q IS NOT NULL AND p.name ILIKE '%' || prm.raw_q || '%' THEN 1
      ELSE 2
    END,
    p.created_at DESC,
    p.id DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

-- 6. Backward-Compatible Chunked Pagination Alias (`get_products_chunked`)
CREATE OR REPLACE FUNCTION get_products_chunked(
  p_limit integer DEFAULT 40,
  p_offset integer DEFAULT 0,
  p_category text DEFAULT NULL,
  p_include_out_of_stock boolean DEFAULT true
)
RETURNS SETOF products
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM get_storefront_products(
    p_limit => p_limit,
    p_offset => p_offset,
    p_category => p_category,
    p_search_query => NULL,
    p_include_out_of_stock => p_include_out_of_stock
  );
$$;

-- 7. Smart Chunked Search RPC Function (`search_products_smart`)
CREATE OR REPLACE FUNCTION search_products_smart(
  search_term text,
  result_limit integer DEFAULT 40,
  result_offset integer DEFAULT 0
)
RETURNS SETOF products
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM get_storefront_products(
    p_limit => result_limit,
    p_offset => result_offset,
    p_category => NULL,
    p_search_query => search_term,
    p_include_out_of_stock => true
  );
$$;

-- 8. High-Speed Bulk Delete RPC Procedure (Server-Side Batch Execution)
CREATE OR REPLACE FUNCTION bulk_delete_products(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM products
  WHERE id = ANY(p_ids);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

