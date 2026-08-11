/**
 * ============================================================
 * pricing-engine.ts — Enterprise Tiered Pricing Engine
 * Ahmed Bahri Store | Sub-100ms Pure JS — No network calls
 * ============================================================
 *
 * All calculations are pure functions with no side-effects.
 * Safe to call on every keystroke / render cycle.
 */

export interface PricingTier {
  label: string;      // e.g. "مفرد", "جملة 1", "جملة 2", "جملة 3"
  minQty: number;     // inclusive lower bound
  maxQty: number;     // inclusive upper bound (use 99999 for ∞)
  discountPct: number; // 0 = no discount, 10 = 10% off base price
}

export interface GlobalPricingConfig {
  mode: "percentage";
  tiers: PricingTier[];
}

export interface ProductPricingOverride {
  id?: string;
  productId: string;
  tierMode: "global" | "custom";
  tier1MinQty: number;
  tier1MaxQty: number;
  tier1DiscountPct: number;
  tier2MinQty: number;
  tier2MaxQty: number;
  tier2DiscountPct: number;
  tier3MinQty: number;
  tier3MaxQty: number;
  tier3DiscountPct: number;
  singlePriceOverride?: number | null;
  wholesalePriceOverride?: number | null;
  notes?: string;
}

// ─── Default global config ────────────────────────────────────────────────────

export const DEFAULT_PRICING_CONFIG: GlobalPricingConfig = {
  mode: "percentage",
  tiers: [
    { label: "مفرد",   minQty: 1,  maxQty: 1,     discountPct: 0  },
    { label: "جملة 1", minQty: 2,  maxQty: 5,     discountPct: 2  },
    { label: "جملة 2", minQty: 6,  maxQty: 10,    discountPct: 5  },
    { label: "جملة 3", minQty: 11, maxQty: 99999, discountPct: 10 },
  ],
};

// ─── Core: Resolve tier for a given quantity ──────────────────────────────────

/**
 * Returns the matching tier for a given quantity.
 * Falls back to the first tier (retail) if no match found.
 */
export function resolveTierForQty(
  qty: number,
  tiers: PricingTier[]
): PricingTier {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  // Walk tiers from highest to lowest to find the best applicable tier
  const reversed = [...sorted].reverse();
  for (const tier of reversed) {
    if (qty >= tier.minQty) return tier;
  }
  return sorted[0] ?? DEFAULT_PRICING_CONFIG.tiers[0];
}

// ─── Core: Calculate tier price ───────────────────────────────────────────────

/**
 * Applies the tier's discount percentage to the base price.
 * Returns the final unit price rounded to 2 decimal places.
 */
export function calculateTierPrice(
  basePrice: number,
  tier: PricingTier
): number {
  if (tier.discountPct <= 0) return round2(basePrice);
  return round2(basePrice * (1 - tier.discountPct / 100));
}

/**
 * Full convenience: given qty + base price + tiers → final unit price.
 */
export function resolveUnitPrice(
  qty: number,
  basePrice: number,
  tiers: PricingTier[]
): { price: number; tier: PricingTier } {
  const tier = resolveTierForQty(qty, tiers);
  const price = calculateTierPrice(basePrice, tier);
  return { price, tier };
}

// ─── Badge / label helpers ────────────────────────────────────────────────────

/**
 * Returns a human-readable label for the active tier at a given qty.
 * e.g. "جملة 1 — خصم 2%"
 */
export function getTierLabel(qty: number, tiers: PricingTier[]): string {
  const tier = resolveTierForQty(qty, tiers);
  if (tier.discountPct === 0) return tier.label;
  return `${tier.label} — خصم ${tier.discountPct}%`;
}

/**
 * Builds the tier badge instruction text shown below the price bar.
 * e.g. "1 قطعة: مفرد | 2-5: جملة 1 (-2%) | 6-10: جملة 2 (-5%) | 11+: جملة 3 (-10%)"
 */
export function buildTierBadgeText(tiers: PricingTier[]): string {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  return sorted
    .map((tier) => {
      const range =
        tier.maxQty >= 99999
          ? `${tier.minQty}+`
          : tier.minQty === tier.maxQty
          ? `${tier.minQty}`
          : `${tier.minQty}-${tier.maxQty}`;
      const discount =
        tier.discountPct > 0 ? ` (-${tier.discountPct}%)` : "";
      return `${range} قطعة: ${tier.label}${discount}`;
    })
    .join(" | ");
}

/**
 * Returns a short version for product cards.
 * e.g. "مفرد | جملة 1 | جملة 2 | جملة 3"
 */
export function buildTierBadgeShort(tiers: PricingTier[]): string {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  return sorted.map((t) => t.label).join(" · ");
}

// ─── Import auto-calculation helpers ─────────────────────────────────────────

/**
 * Case A: Derive retail (single) price from cost price + markup %.
 * e.g. cost=1000, markup=10 → retail=1100
 */
export function deriveRetailFromCost(
  costPrice: number,
  markupPct: number
): number {
  return round2(costPrice * (1 + markupPct / 100));
}

/**
 * Case B: Derive wholesale price from retail price - reduction %.
 * e.g. retail=1100, reductionPct=10 → wholesale=990
 */
export function deriveWholesaleFromRetail(
  retailPrice: number,
  reductionPct: number
): number {
  return round2(retailPrice * (1 - reductionPct / 100));
}

// ─── Bidirectional price sync ─────────────────────────────────────────────────

/**
 * If the admin changes the wholesale price, scale retail proportionally.
 *
 * Formula: newRetail = oldRetail × (newWholesale / oldWholesale)
 * Preserves the original margin ratio.
 *
 * Returns the new retail price (or the original retail if oldWholesale = 0).
 */
export function syncRetailFromWholesaleChange(
  newWholesale: number,
  oldWholesale: number,
  oldRetail: number
): number {
  if (oldWholesale <= 0) return oldRetail;
  return round2(oldRetail * (newWholesale / oldWholesale));
}

/**
 * If the admin changes the retail price, scale wholesale proportionally.
 *
 * Formula: newWholesale = oldWholesale × (newRetail / oldRetail)
 *
 * Returns the new wholesale price (or the original wholesale if oldRetail = 0).
 */
export function syncWholesaleFromRetailChange(
  newRetail: number,
  oldRetail: number,
  oldWholesale: number
): number {
  if (oldRetail <= 0) return oldWholesale;
  return round2(oldWholesale * (newRetail / oldRetail));
}

// ─── Override-aware effective tiers resolver ──────────────────────────────────

/**
 * Given a product's override record and the global config,
 * returns the effective PricingTier[] to use for price calculations.
 */
export function getEffectiveTiers(
  globalConfig: GlobalPricingConfig,
  override?: ProductPricingOverride | null
): PricingTier[] {
  if (!override || override.tierMode === "global") {
    return globalConfig.tiers;
  }

  // Custom override — build tiers from override fields
  return [
    {
      label: "مفرد",
      minQty: 1,
      maxQty: override.tier1MinQty - 1,
      discountPct: 0,
    },
    {
      label: "جملة 1",
      minQty: override.tier1MinQty,
      maxQty: override.tier1MaxQty,
      discountPct: override.tier1DiscountPct,
    },
    {
      label: "جملة 2",
      minQty: override.tier2MinQty,
      maxQty: override.tier2MaxQty,
      discountPct: override.tier2DiscountPct,
    },
    {
      label: "جملة 3",
      minQty: override.tier3MinQty,
      maxQty: override.tier3MaxQty,
      discountPct: override.tier3DiscountPct,
    },
  ].filter((t) => t.minQty <= t.maxQty && t.minQty >= 1);
}

// ─── DB row mapper ────────────────────────────────────────────────────────────

/** Maps a Supabase DB row to ProductPricingOverride */
export function overrideFromRow(
  row: Record<string, unknown>
): ProductPricingOverride {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    tierMode: (row.tier_mode as "global" | "custom") ?? "global",
    tier1MinQty: Number(row.tier1_min_qty ?? 2),
    tier1MaxQty: Number(row.tier1_max_qty ?? 5),
    tier1DiscountPct: Number(row.tier1_discount_pct ?? 2),
    tier2MinQty: Number(row.tier2_min_qty ?? 6),
    tier2MaxQty: Number(row.tier2_max_qty ?? 10),
    tier2DiscountPct: Number(row.tier2_discount_pct ?? 5),
    tier3MinQty: Number(row.tier3_min_qty ?? 11),
    tier3MaxQty: Number(row.tier3_max_qty ?? 99999),
    tier3DiscountPct: Number(row.tier3_discount_pct ?? 10),
    singlePriceOverride: row.single_price_override != null ? Number(row.single_price_override) : null,
    wholesalePriceOverride: row.wholesale_price_override != null ? Number(row.wholesale_price_override) : null,
    notes: (row.notes as string) ?? "",
  };
}

/** Maps ProductPricingOverride to a Supabase DB row */
export function overrideToRow(
  override: ProductPricingOverride
): Record<string, unknown> {
  return {
    product_id: override.productId,
    tier_mode: override.tierMode,
    tier1_min_qty: override.tier1MinQty,
    tier1_max_qty: override.tier1MaxQty,
    tier1_discount_pct: override.tier1DiscountPct,
    tier2_min_qty: override.tier2MinQty,
    tier2_max_qty: override.tier2MaxQty,
    tier2_discount_pct: override.tier2DiscountPct,
    tier3_min_qty: override.tier3MinQty,
    tier3_max_qty: override.tier3MaxQty,
    tier3_discount_pct: override.tier3DiscountPct,
    single_price_override: override.singlePriceOverride ?? null,
    wholesale_price_override: override.wholesalePriceOverride ?? null,
    notes: override.notes ?? "",
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Formats a price number as Iraqi Dinar locale string */
export function formatPrice(price: number): string {
  return price.toLocaleString("ar-IQ");
}
