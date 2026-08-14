/**
 * barcode-service.ts
 *
 * Pure service layer for Barcode & QR Code operations.
 * Completely decoupled from any UI component or React context.
 * All database operations go through this module.
 */

import { supabase } from "./supabase-client";
import type { Product } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BarcodeRecord {
  id: string;
  product_id: string;
  code: string;
  code_type: "barcode" | "qr_code" | "ean13" | "code128";
  is_primary: boolean;
  created_at: string;
}

export interface CodegenResult {
  productId: string;
  barcode: string;
  qrCode: string;
  wasNew: boolean;
}

export interface DedupCheckResult {
  productId: string;
  barcode: string | null;
  qrCode: string | null;
}

// ─── EAN-13 Generation ────────────────────────────────────────────────────────

/**
 * Generates a valid EAN-13 barcode string.
 * Format: [prefix(6-7 digits)] + [sequential(5-6 digits)] + [check digit]
 *
 * @param sequence  A unique integer used as the sequential component
 * @param prefix    Store-specific prefix (defaults to "622000" — Iraq GS1 range)
 */
export function generateEAN13(sequence: number, prefix = "622000"): string {
  const seqPadded = String(sequence).padStart(6, "0").slice(0, 6);
  const partialCode = `${prefix}${seqPadded}`;
  const digits = partialCode.slice(0, 12).split("").map(Number);
  if (digits.length < 12) {
    throw new Error(`EAN-13 prefix+sequence must be 12 digits, got: ${partialCode}`);
  }
  // EAN-13 check digit algorithm
  const sum = digits.reduce((acc, d, i) => acc + (i % 2 === 0 ? d : d * 3), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${digits.join("")}${checkDigit}`;
}

/**
 * Generates a UUID-based QR code data string (unique, non-sequential).
 */
export function generateQRData(productId: string): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `QR-${productId.slice(0, 8).toUpperCase()}-${rand}`;
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Look up a product by its barcode or QR code.
 * Uses the indexed products.barcode / products.qr_code columns for O(log n) lookup.
 */
export async function lookupByBarcode(code: string): Promise<Product | null> {
  const cleaned = code.trim();
  if (!cleaned) return null;

  // First try exact barcode match (most common for physical scanners)
  const { data: byBarcode } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", cleaned)
    .maybeSingle();

  if (byBarcode) return mapRow(byBarcode);

  // Fallback: try QR code match
  const { data: byQR } = await supabase
    .from("products")
    .select("*")
    .eq("qr_code", cleaned)
    .maybeSingle();

  if (byQR) return mapRow(byQR);

  // Last resort: check product_barcodes lookup table
  const { data: barcodeRecord } = await supabase
    .from("product_barcodes")
    .select("product_id")
    .eq("code", cleaned)
    .maybeSingle();

  if (barcodeRecord?.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", barcodeRecord.product_id)
      .maybeSingle();
    if (product) return mapRow(product);
  }

  return null;
}

/**
 * Assign a barcode to a product.
 * Enforces 1-to-1: checks for existing assignment before inserting.
 * Throws if the code is already assigned to a different product.
 */
export async function assignBarcodeToProduct(
  productId: string,
  barcode: string,
  codeType: "barcode" | "qr_code" = "barcode"
): Promise<void> {
  const cleaned = barcode.trim();
  if (!cleaned) throw new Error("لا يمكن تعيين كود فارغ");

  // Check for collisions (strict 1-to-1 guard)
  const { data: existing } = await supabase
    .from("product_barcodes")
    .select("product_id")
    .eq("code", cleaned)
    .maybeSingle();

  if (existing && existing.product_id !== productId) {
    throw new Error(
      `الكود "${cleaned}" مرتبط بمنتج آخر. كل كود يجب أن يكون حصرياً لمنتج واحد فقط.`
    );
  }

  // Upsert into product_barcodes (safe re-run)
  const { error: insertErr } = await supabase
    .from("product_barcodes")
    .upsert(
      { product_id: productId, code: cleaned, code_type: codeType, is_primary: true },
      { onConflict: "product_id,code_type" }
    );

  if (insertErr) throw new Error(`خطأ في حفظ الكود: ${insertErr.message}`);

  // Also update the products table directly for backward compat & index usage
  const col = codeType === "barcode" ? "barcode" : "qr_code";
  const { error: updateErr } = await supabase
    .from("products")
    .update({ [col]: cleaned })
    .eq("id", productId);

  if (updateErr) throw new Error(`خطأ في تحديث المنتج: ${updateErr.message}`);
}

/**
 * Bulk auto-generate barcodes for all products that are missing them.
 * Uses sequential EAN-13 codes with the store prefix.
 * Reports progress via callback.
 */
export async function bulkGenerateMissingCodes(
  onProgress?: (done: number, total: number) => void
): Promise<CodegenResult[]> {
  // Fetch all products missing barcode
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, barcode, qr_code")
    .or("barcode.is.null,barcode.eq.\"\"")
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`خطأ في جلب المنتجات: ${error.message}`);
  if (!products || products.length === 0) return [];

  // Get current highest sequence from existing barcodes to avoid collisions
  const { data: existingCodes } = await supabase
    .from("products")
    .select("barcode")
    .not("barcode", "is", null)
    .neq("barcode", "");

  let maxSeq = 1000; // Start from 1000 for cleaner codes
  if (existingCodes) {
    existingCodes.forEach(({ barcode }) => {
      if (barcode && /^\d{13}$/.test(barcode)) {
        const seq = parseInt(barcode.slice(6, 12), 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });
  }

  const results: CodegenResult[] = [];
  let seq = maxSeq + 1;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    try {
      const barcode = generateEAN13(seq++);
      const qrCode = generateQRData(product.id);

      await supabase
        .from("products")
        .update({ barcode, qr_code: qrCode })
        .eq("id", product.id);

      // Also insert into product_barcodes table
      await supabase
        .from("product_barcodes")
        .upsert([
          { product_id: product.id, code: barcode, code_type: "barcode", is_primary: true },
          { product_id: product.id, code: qrCode, code_type: "qr_code", is_primary: false },
        ], { onConflict: "product_id,code_type" });

      results.push({ productId: product.id, barcode, qrCode, wasNew: true });
    } catch (err) {
      console.error(`[BarcodeService] Failed to generate for product ${product.id}:`, err);
    }

    onProgress?.(i + 1, products.length);
  }

  return results;
}

/**
 * Deduplication check for import:
 * Given a product name, check if a product with that EXACT name already exists
 * in the DB and has barcode/QR codes assigned.
 *
 * If found → return the existing codes so the importer can inherit them
 * instead of leaving the imported product code-less.
 */
export async function checkDuplicateOnImport(
  productName: string
): Promise<DedupCheckResult | null> {
  const trimmed = productName.trim();
  if (!trimmed) return null;

  const { data } = await supabase
    .from("products")
    .select("id, barcode, qr_code")
    .eq("name", trimmed)
    .maybeSingle();

  if (!data) return null;
  if (!data.barcode && !data.qr_code) return null;

  return {
    productId: data.id,
    barcode: data.barcode ?? null,
    qrCode: data.qr_code ?? null,
  };
}

/**
 * Get barcode statistics summary for the admin hub.
 */
export async function getBarcodeSummary(): Promise<{
  total: number;
  withBarcode: number;
  withQR: number;
  missing: number;
}> {
  const { data, error } = await supabase
    .from("products")
    .select("barcode, qr_code")
    .eq("is_deleted", false);

  if (error || !data) return { total: 0, withBarcode: 0, withQR: 0, missing: 0 };

  const total = data.length;
  const withBarcode = data.filter((p) => p.barcode && p.barcode.trim()).length;
  const withQR = data.filter((p) => p.qr_code && p.qr_code.trim()).length;
  const missing = data.filter(
    (p) => (!p.barcode || !p.barcode.trim()) && (!p.qr_code || !p.qr_code.trim())
  ).length;

  return { total, withBarcode, withQR, missing };
}

// ─── Row Mapper ───────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    image: (row.image as string) || "",
    originalImageUrl: (row.original_image_url as string) || "",
    costPrice: Number(row.cost_price) || 0,
    wholesalePrice: Number(row.wholesale_price) || 0,
    profitMargin: Number(row.profit_margin) || 0,
    retailPrice: Number(row.retail_price) || 0,
    stock: Number(row.stock) || 0,
    supplierId: (row.supplier_id as string) || "",
    notes: (row.notes as string) || "",
    createdAt: (row.created_at as string) || "",
    updatedAt: (row.updated_at as string) || "",
    barcode: (row.barcode as string | null) || null,
    qrCode: (row.qr_code as string | null) || null,
  };
}
