-- 0. Enable PostgreSQL Trigram Extension for Fast Text Searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. High-Performance Indexes for Products, Suppliers & Trash
CREATE INDEX IF NOT EXISTS idx_products_id ON products(id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_trash_id ON trash(id);
CREATE INDEX IF NOT EXISTS idx_trash_entity_id ON trash(entity_id);
CREATE INDEX IF NOT EXISTS idx_trash_entity ON trash(entity);
CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash(deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_id ON orders(id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 2. Foreign Key ON DELETE CASCADE & SET NULL Optimization
-- Ensures deleting a supplier or product safely cascades or sets null without DB conflict

ALTER TABLE IF EXISTS products
  DROP CONSTRAINT IF EXISTS fk_products_supplier,
  ADD CONSTRAINT fk_products_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  ON DELETE SET NULL;

-- 3. High-Speed Bulk Delete RPC Procedure (Server-Side Batch Execution)
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
