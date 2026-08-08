/**
 * ==========================================
 * import-validator.ts
 * Smart Import Column Validator — Enterprise Grade
 * أحمد بحري Dashboard | Full-Stack Systems
 * ==========================================
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export interface ColumnValidationIssue {
  severity: ValidationSeverity;
  field: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  requiresCategoryAction: boolean;
  actionType?: "PROMPT_USER_FOR_CATEGORY" | "NONE";
  message?: string;
  detectedColumns: DetectedColumns;
  issues: ColumnValidationIssue[];
  normalizedHeaders: string[];
}

export interface DetectedColumns {
  name: boolean;
  costPrice: boolean;
  retailPrice: boolean;
  stock: boolean;
  category: boolean;
  supplier: boolean;
  wholesalePrice: boolean;
  notes: boolean;
  image: boolean;
}

// ─── Column Alias Maps (AR + EN with full fuzzy support) ──────────────────────

const COLUMN_ALIASES: Record<keyof DetectedColumns, string[]> = {
  name: [
    "name", "product", "product_name", "productname",
    "اسم المنتج", "اسم", "الاسم", "منتج", "عنوان",
  ],
  costPrice: [
    "costprice", "cost_price", "cost", "buyingprice", "buying_price",
    "سعر التكلفة", "التكلفة", "تكلفة", "الكلفة", "كلفة", "سعر الكلفة", "سعر الشراء",
  ],
  retailPrice: [
    "retailprice", "retail_price", "retail", "price", "sellingprice",
    "selling_price", "unit_price",
    "سعر المفرد", "المفرد", "مفرد", "السعر", "سعر البيع", "سعر",
  ],
  wholesalePrice: [
    "wholesaleprice", "wholesale_price", "wholesale",
    "سعر الجملة", "الجملة", "جملة",
  ],
  stock: [
    "stock", "quantity", "qty", "count", "inventory", "available",
    "الكمية", "المخزون", "العدد", "الرصيد", "متاح",
  ],
  category: [
    "category", "category_name", "categoryname", "section", "group",
    "القسم", "قسم", "الفئة", "فئة", "التصنيف", "تصنيف", "النوع", "نوع", "المجموعة",
  ],
  supplier: [
    "supplier", "supplierid", "supplier_id", "supplier_name", "vendor",
    "المورد", "اسم المورد", "مورد", "المزود",
  ],
  notes: [
    "notes", "note", "description", "desc", "details",
    "ملاحظات", "وصف", "الوصف", "تفاصيل", "الوصف التفصيلي",
  ],
  image: [
    "image", "img", "photo", "pic", "picture", "thumbnail",
    "product_image", "productimage", "image_url",
    "الصورة", "صورة", "رابط الصورة", "رابط صورة المنتج", "صورة المنتج",
  ],
};

// ─── Core: Normalize a single header string ───────────────────────────────────

/**
 * Normalises a column header: trims whitespace, lowercases,
 * and strips common Unicode directional / zero-width chars.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u200F\u200E]/g, "") // strip invisible chars
    .trim()
    .toLowerCase();
}

// ─── Core: Match one header to a field ───────────────────────────────────────

function matchField(
  normalizedHeader: string,
  field: keyof DetectedColumns
): boolean {
  const aliases = COLUMN_ALIASES[field];

  // 1. Exact match (fastest)
  if (aliases.includes(normalizedHeader)) return true;

  // 2. Partial / contains match (fuzzy fallback)
  for (const alias of aliases) {
    if (normalizedHeader.includes(alias) || alias.includes(normalizedHeader)) {
      return true;
    }
  }

  return false;
}

// ─── Main Export: validateImportColumns ──────────────────────────────────────

/**
 * Validates the column headers of an uploaded Excel/CSV file.
 *
 * @param fileHeaders   Raw header strings from the first row of the file.
 * @returns             A structured ValidationResult object.
 *
 * @example
 * const result = validateImportColumns(["اسم المنتج", "السعر", "الكمية"]);
 * if (result.requiresCategoryAction) showCategoryModal();
 */
export function validateImportColumns(fileHeaders: string[]): ValidationResult {
  if (!Array.isArray(fileHeaders) || fileHeaders.length === 0) {
    return {
      isValid: false,
      requiresCategoryAction: false,
      detectedColumns: buildEmptyDetected(),
      issues: [
        {
          severity: "error",
          field: "headers",
          message: "الملف لا يحتوي على أي أعمدة أو فارغ تماماً.",
        },
      ],
      normalizedHeaders: [],
    };
  }

  const normalizedHeaders = fileHeaders.map(normalizeHeader);

  // Detect which known fields exist
  const detectedColumns = {} as DetectedColumns;
  for (const field of Object.keys(COLUMN_ALIASES) as Array<keyof DetectedColumns>) {
    detectedColumns[field] = normalizedHeaders.some((h) => matchField(h, field));
  }

  const issues: ColumnValidationIssue[] = [];

  // ── Required: product name ─────────────────────────────────────────────────
  if (!detectedColumns.name) {
    issues.push({
      severity: "error",
      field: "name",
      message: 'لم يتم العثور على عمود "اسم المنتج" وهو حقل إلزامي.',
      suggestion: 'أضف عموداً باسم "اسم المنتج" أو "name" في الملف.',
    });
  }

  // ── Warning: at least one pricing column ──────────────────────────────────
  if (!detectedColumns.costPrice && !detectedColumns.retailPrice) {
    issues.push({
      severity: "warning",
      field: "price",
      message: "لم يتم العثور على عمود سعر التكلفة أو سعر المفرد. سيتم تعيين الأسعار إلى صفر.",
      suggestion: 'أضف عمود "سعر التكلفة" أو "سعر المفرد" لضمان استيراد صحيح.',
    });
  }

  // ── Info: optional but useful columns ─────────────────────────────────────
  if (!detectedColumns.stock) {
    issues.push({
      severity: "info",
      field: "stock",
      message: 'لم يتم العثور على عمود "الكمية". سيتم تعيين الكمية إلى صفر.',
    });
  }

  if (!detectedColumns.image) {
    issues.push({
      severity: "info",
      field: "image",
      message: "لم يتم العثور على عمود الصورة. يمكن رفع الصور لاحقاً من لوحة التحكم.",
    });
  }

  // ── Category: trigger prompt if missing ───────────────────────────────────
  const requiresCategoryAction = !detectedColumns.category;
  if (requiresCategoryAction) {
    issues.push({
      severity: "warning",
      field: "category",
      message:
        'لم يتم العثور على حقل "القسم" داخل الملف المرفوع. ' +
        "يرجى تحديد قسم أو إنشاء قسم جديد لجميع عناصر هذا الملف.",
      suggestion: 'أضف عموداً باسم "القسم" أو "category" لتعيين أقسام تلقائية.',
    });
  }

  const hasBlockingErrors = issues.some((i) => i.severity === "error");

  return {
    isValid: !hasBlockingErrors,
    requiresCategoryAction,
    actionType: requiresCategoryAction ? "PROMPT_USER_FOR_CATEGORY" : "NONE",
    message: requiresCategoryAction
      ? 'لم يتم العثور على حقل "القسم" داخل الملف المرفوع. يرجى تحديد قسم موحد لكافة المنتجات.'
      : undefined,
    detectedColumns,
    issues,
    normalizedHeaders,
  };
}

// ─── Utility: extract headers from XLSX workbook ─────────────────────────────

/**
 * Extracts column headers from the first row of an uploaded file.
 * Requires `xlsx` package (already installed in this project).
 *
 * @param file  Browser File object (.xlsx / .xls / .csv)
 * @returns     Promise resolving to the raw string headers array
 */
export async function extractHeadersFromFile(file: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error("الملف فارغ أو غير صالح"));
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        // sheet_to_json with header: 1 gives us raw rows as arrays
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
        const firstRow = rows[0];
        if (!firstRow || firstRow.length === 0) {
          reject(new Error("لم يتم العثور على أي أعمدة في الملف"));
          return;
        }
        resolve(firstRow.map(String));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildEmptyDetected(): DetectedColumns {
  return Object.keys(COLUMN_ALIASES).reduce((acc, key) => {
    acc[key as keyof DetectedColumns] = false;
    return acc;
  }, {} as DetectedColumns);
}

// ─── Date-based filtering helpers (used by DateFilterPanel) ──────────────────

export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "custom";

export interface DateFilter {
  preset: DatePreset;
  from?: string; // ISO date string
  to?: string;   // ISO date string
}

/**
 * Resolves a DateFilter preset to concrete from/to ISO strings (date only).
 */
export function resolveDateRange(filter: DateFilter): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const toISODate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (filter.preset === "custom" && filter.from && filter.to) {
    return { from: filter.from, to: filter.to };
  }

  const today = toISODate(now);

  if (filter.preset === "today") {
    return { from: today, to: today };
  }

  if (filter.preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = toISODate(y);
    return { from: yStr, to: yStr };
  }

  if (filter.preset === "last7") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: toISODate(d), to: today };
  }

  if (filter.preset === "last30") {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { from: toISODate(d), to: today };
  }

  if (filter.preset === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISODate(start), to: today };
  }

  // fallback: all time
  return { from: "2000-01-01", to: today };
}

/**
 * Filters an array of products by their createdAt date using a DateFilter.
 */
export function filterProductsByDate<T extends { createdAt: string }>(
  products: T[],
  filter: DateFilter | null
): T[] {
  if (!filter) return products;
  const { from, to } = resolveDateRange(filter);
  return products.filter((p) => {
    if (!p.createdAt) return false;
    const dateStr = p.createdAt.slice(0, 10); // YYYY-MM-DD
    return dateStr >= from && dateStr <= to;
  });
}
