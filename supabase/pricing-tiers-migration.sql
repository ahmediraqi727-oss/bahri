-- ==============================================================================
-- PRICING TIERS & DISCOUNT ENGINE MIGRATION
-- Ahmed Bahri Store — Enterprise Pricing Engine v1.0
-- Run this in Supabase SQL Editor
-- ==============================================================================

-- ─── 1. Extend settings table with pricing config columns ────────────────────

-- Global tier configuration (JSON array of tier objects)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS pricing_tiers JSONB DEFAULT '{
    "mode": "percentage",
    "tiers": [
      { "label": "مفرد",   "minQty": 1,  "maxQty": 1,    "discountPct": 0  },
      { "label": "جملة 1", "minQty": 2,  "maxQty": 5,    "discountPct": 2  },
      { "label": "جملة 2", "minQty": 6,  "maxQty": 10,   "discountPct": 5  },
      { "label": "جملة 3", "minQty": 11, "maxQty": 99999,"discountPct": 10 }
    ]
  }'::jsonb;

-- Auto-calculation: markup % applied to cost price to derive retail price
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS import_markup_pct NUMERIC DEFAULT 10;

-- Auto-calculation: reduction % applied to retail price to derive wholesale price
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS import_wholesale_reduction_pct NUMERIC DEFAULT 10;

-- Update the default pricing_tiers for existing settings rows that have null
UPDATE public.settings
  SET pricing_tiers = '{
    "mode": "percentage",
    "tiers": [
      { "label": "مفرد",   "minQty": 1,  "maxQty": 1,    "discountPct": 0  },
      { "label": "جملة 1", "minQty": 2,  "maxQty": 5,    "discountPct": 2  },
      { "label": "جملة 2", "minQty": 6,  "maxQty": 10,   "discountPct": 5  },
      { "label": "جملة 3", "minQty": 11, "maxQty": 99999,"discountPct": 10 }
    ]
  }'::jsonb
  WHERE pricing_tiers IS NULL;

UPDATE public.settings
  SET import_markup_pct = 10
  WHERE import_markup_pct IS NULL;

UPDATE public.settings
  SET import_wholesale_reduction_pct = 10
  WHERE import_wholesale_reduction_pct IS NULL;

-- ─── 2. Per-product pricing override table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_pricing_overrides (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id               UUID UNIQUE NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

  -- 'global' = use system-wide tier rules | 'custom' = use fields below
  tier_mode                TEXT NOT NULL DEFAULT 'global' CHECK (tier_mode IN ('global', 'custom')),

  -- Custom tier boundaries (qty thresholds) — ignored when tier_mode='global'
  tier1_min_qty            INT NOT NULL DEFAULT 2,
  tier1_max_qty            INT NOT NULL DEFAULT 5,
  tier1_discount_pct       NUMERIC NOT NULL DEFAULT 2,

  tier2_min_qty            INT NOT NULL DEFAULT 6,
  tier2_max_qty            INT NOT NULL DEFAULT 10,
  tier2_discount_pct       NUMERIC NOT NULL DEFAULT 5,

  tier3_min_qty            INT NOT NULL DEFAULT 11,
  tier3_max_qty            INT NOT NULL DEFAULT 99999,
  tier3_discount_pct       NUMERIC NOT NULL DEFAULT 10,

  -- Optional: exact price overrides (when not null, overrides percentage logic)
  single_price_override    NUMERIC,
  wholesale_price_override NUMERIC,

  notes                    TEXT DEFAULT '',
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- Index for fast product lookup
CREATE INDEX IF NOT EXISTS idx_product_pricing_overrides_product_id
  ON public.product_pricing_overrides (product_id);

-- ─── 3. RLS policies ─────────────────────────────────────────────────────────

ALTER TABLE public.product_pricing_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on product_pricing_overrides" ON public.product_pricing_overrides;
CREATE POLICY "Allow all operations on product_pricing_overrides"
  ON public.product_pricing_overrides
  FOR ALL TO public, authenticated, anon
  USING (true)
  WITH CHECK (true);

-- ─── 4. Grants ───────────────────────────────────────────────────────────────

GRANT ALL ON TABLE public.product_pricing_overrides TO authenticated, anon, public;

-- ─── 5. Auto-update trigger for updated_at ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_pricing_overrides_updated_at ON public.product_pricing_overrides;
CREATE TRIGGER trg_product_pricing_overrides_updated_at
  BEFORE UPDATE ON public.product_pricing_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 6. Reload schema cache ──────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
