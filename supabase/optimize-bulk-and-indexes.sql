-- =================================================================================
-- Ahmed Bahri Store — High-Performance Chunked Pagination, Image & Search Indexes
-- =================================================================================

-- 0. Enable PostgreSQL Trigram Extension for Fast Arabic & Partial Text Searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Ensure Image & Thumbnail Columns Exist on Products Table
ALTER TABLE IF EXISTS products
  ADD COLUMN IF NOT EXISTS original_image_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- 2. High-Performance Composite & Trigram Indexes for Chunked Pagination (LIMIT / OFFSET)
CREATE INDEX IF NOT EXISTS idx_products_id ON products(id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_pagination_cursor ON products(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_products_stock_created_at ON products(stock, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- Trigram GIN Indexes for Instant Multi-Token & Fuzzy Search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_notes_trgm ON products USING gin (notes gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm ON products USING gin (barcode gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_trash_id ON trash(id);
CREATE INDEX IF NOT EXISTS idx_trash_entity_id ON trash(entity_id);
CREATE INDEX IF NOT EXISTS idx_trash_entity ON trash(entity);
CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash(deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_id ON orders(id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 3. Foreign Key ON DELETE SET NULL Optimization
ALTER TABLE IF EXISTS products
  DROP CONSTRAINT IF EXISTS fk_products_supplier,
  ADD CONSTRAINT fk_products_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  ON DELETE SET NULL;

-- 4. Smart Chunked Search RPC Function (Returns Paginated Batches with Image & Thumbnail)
CREATE OR REPLACE FUNCTION search_products_smart(
  search_term text,
  result_limit integer DEFAULT 40,
  result_offset integer DEFAULT 0
)
RETURNS SETOF products
LANGUAGE sql
STABLE
AS $$
  SELECT p.*
  FROM products p
  WHERE
    search_term IS NULL
    OR btrim(search_term) = ''
    OR p.name ILIKE '%' || btrim(search_term) || '%'
    OR COALESCE(p.notes, '') ILIKE '%' || btrim(search_term) || '%'
    OR COALESCE(p.barcode, '') ILIKE '%' || btrim(search_term) || '%'
    OR similarity(p.name, btrim(search_term)) > 0.22
  ORDER BY
    CASE
      WHEN p.name ILIKE btrim(search_term) || '%' THEN 0
      WHEN p.name ILIKE '%' || btrim(search_term) || '%' THEN 1
      ELSE 2
    END,
    similarity(p.name, btrim(search_term)) DESC,
    p.created_at DESC
  LIMIT GREATEST(result_limit, 1)
  OFFSET GREATEST(result_offset, 0);
$$;

-- 5. Chunked Storefront Pagination RPC Function (20 Mobile / 40 Desktop, 40/80 Fast Scroll)
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
  SELECT p.*
  FROM products p
  WHERE
    (p_include_out_of_stock OR COALESCE(p.stock, 0) > 0)
    AND (
      p_category IS NULL
      OR btrim(p_category) = ''
      OR btrim(p_category) = 'الكل'
      OR COALESCE(p.notes, '') ILIKE '%' || btrim(p_category) || '%'
      OR COALESCE(p.notes, '') ILIKE '%جميع الاقسام%'
      OR COALESCE(p.notes, '') ILIKE '%جميع الأقسام%'
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

-- 6. High-Speed Bulk Delete RPC Procedure (Server-Side Batch Execution)
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

