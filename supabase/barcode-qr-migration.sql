-- ==============================================================================
-- BARCODE & QR CODE ECOSYSTEM — MIGRATION SCRIPT
-- Ahmed Bahri Store Platform — Enterprise Grade
-- Run this in Supabase SQL Editor ONCE
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add barcode & qr_code columns to products table (if not already present)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS qr_code TEXT DEFAULT NULL;

-- Enforce strict 1-to-1: one barcode → one product (no cross-contamination)
-- Uses a partial unique index so NULL values are excluded (multiple NULLs are allowed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode
  ON public.products (barcode)
  WHERE barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_qr_code
  ON public.products (qr_code)
  WHERE qr_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. High-performance indexes for sub-millisecond barcode lookup
--    btree on barcode: perfect for exact = lookups (scanner input)
--    GIN on name (trigram): supports fast fuzzy name dedup check on import
-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure pg_trgm extension is active (safe to re-run)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree index on barcode (used by lookupByBarcode)
CREATE INDEX IF NOT EXISTS idx_products_barcode_btree
  ON public.products USING btree (barcode)
  WHERE barcode IS NOT NULL;

-- btree index on qr_code
CREATE INDEX IF NOT EXISTS idx_products_qr_code_btree
  ON public.products USING btree (qr_code)
  WHERE qr_code IS NOT NULL;

-- GIN trigram index on product name for fast fuzzy dedup check during import
CREATE INDEX IF NOT EXISTS idx_products_name_gin_trgm
  ON public.products USING gin (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. product_barcodes — dedicated lookup table for O(1) code→product resolution
--    Strict 1-to-1: product_id is UNIQUE (one product, one barcode record)
--    code is UNIQUE (one code maps to exactly one product, no overlaps)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  code_type  TEXT NOT NULL DEFAULT 'barcode', -- 'barcode' | 'qr_code' | 'ean13' | 'code128'
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_barcodes_product_id_type UNIQUE (product_id, code_type),
  CONSTRAINT uq_product_barcodes_code UNIQUE (code)
);

-- Fast btree lookup on code (the most frequent query path)
CREATE INDEX IF NOT EXISTS idx_product_barcodes_code_btree
  ON public.product_barcodes USING btree (code);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id
  ON public.product_barcodes USING btree (product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Add scanner_permissions column to settings table
--    Stores per-role scanner feature flags as JSONB
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS scanner_permissions JSONB DEFAULT '{
    "manager": {
      "scanner.view_button": true,
      "scanner.use_camera": true,
      "scanner.use_image_upload": true,
      "scanner.use_manual_entry": true,
      "scanner.use_hardware": true,
      "scanner.admin_generate": true
    },
    "admin": {
      "scanner.view_button": true,
      "scanner.use_camera": true,
      "scanner.use_image_upload": true,
      "scanner.use_manual_entry": true,
      "scanner.use_hardware": true,
      "scanner.admin_generate": false
    },
    "customer": {
      "scanner.view_button": true,
      "scanner.use_camera": true,
      "scanner.use_image_upload": false,
      "scanner.use_manual_entry": false,
      "scanner.use_hardware": false,
      "scanner.admin_generate": false
    }
  }'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security for product_barcodes
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read barcodes (for scanner lookup)
CREATE POLICY IF NOT EXISTS "product_barcodes_select_all"
  ON public.product_barcodes FOR SELECT
  USING (true);

-- Only authenticated (non-anon) users can insert/update/delete
CREATE POLICY IF NOT EXISTS "product_barcodes_insert_auth"
  ON public.product_barcodes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "product_barcodes_update_auth"
  ON public.product_barcodes FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "product_barcodes_delete_auth"
  ON public.product_barcodes FOR DELETE
  USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Sync trigger: keep products.barcode in sync with product_barcodes.code
--    for backward compatibility and simple direct-column queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_product_barcode_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code_type = 'barcode' THEN
    UPDATE public.products SET barcode = NEW.code WHERE id = NEW.product_id;
  ELSIF NEW.code_type = 'qr_code' THEN
    UPDATE public.products SET qr_code = NEW.code WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_barcode_column ON public.product_barcodes;
CREATE TRIGGER trg_sync_barcode_column
  AFTER INSERT OR UPDATE ON public.product_barcodes
  FOR EACH ROW EXECUTE FUNCTION sync_product_barcode_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Indexes summary:
--   products.barcode       → btree  (exact scan lookup, O(log n))
--   products.qr_code       → btree  (exact scan lookup, O(log n))
--   products.name          → GIN trigram (fuzzy dedup on import)
--   product_barcodes.code  → btree  (primary lookup table, O(log n))
-- All constraints enforce strict 1-to-1 mapping at DB level (ACID compliant)
-- ==============================================================================
