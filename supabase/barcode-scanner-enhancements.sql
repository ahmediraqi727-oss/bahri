-- ==============================================================================
-- BARCODE & QR ECOSYSTEM — ENHANCEMENTS & USAGE TRACKING MIGRATION SCRIPT
-- Ahmed Bahri Store Platform — Enterprise Grade
-- Run this in Supabase SQL Editor ONCE
-- ==============================================================================

-- 1. Add scan_count, last_scanned_at, and is_barcode_active to public.products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS scan_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_barcode_active BOOLEAN DEFAULT true;

-- 2. Create B-Tree indexes for high-performance sorting and date range queries
CREATE INDEX IF NOT EXISTS idx_products_scan_count
  ON public.products USING btree (scan_count DESC);

CREATE INDEX IF NOT EXISTS idx_products_last_scanned_at
  ON public.products USING btree (last_scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_created_at_desc
  ON public.products USING btree (created_at DESC);

-- 3. Atomic RPC function to increment scan count when a product barcode is scanned
CREATE OR REPLACE FUNCTION increment_product_scan_count(target_product_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.products
  SET
    scan_count = COALESCE(scan_count, 0) + 1,
    last_scanned_at = NOW()
  WHERE id = target_product_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_product_scan_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_product_scan_count(UUID) TO anon;

-- ==============================================================================
-- Done. Scan count tracking and sorting indexes ready.
-- ==============================================================================
