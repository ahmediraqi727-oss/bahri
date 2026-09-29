import { Order, formatInvoiceSerial } from "@/lib/order-types";
import { Product, Supplier } from "@/lib/types";

/**
 * Escapes a cell value for CSV format.
 * Wraps values in quotes if they contain commas, quotes, or newlines.
 */
function escapeCSVCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const str = String(value);
  // If string contains quote, comma, or newline, escape quotes and wrap in quotes
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Generates and triggers browser download of a CSV file with UTF-8 BOM
 * ensuring full compatibility with Microsoft Excel, Google Sheets, and Numbers in Arabic.
 */
export function downloadCSV(filename: string, headers: string[], rows: (string | number | undefined | null)[][]) {
  const csvRows: string[] = [];

  // Header row
  csvRows.push(headers.map(escapeCSVCell).join(","));

  // Data rows
  for (const row of rows) {
    csvRows.push(row.map(escapeCSVCell).join(","));
  }

  // Prepend UTF-8 BOM (\uFEFF) for Arabic character preservation in Excel
  const csvContent = "\uFEFF" + csvRows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const ORDER_STATUS_ARABIC: Record<Order["status"], string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  shipped: "قيد الشحن",
  delivered: "مكتمل (تم التوصيل)",
  cancelled: "ملغي",
};

/**
 * Bulk exports orders to CSV with complete invoice details.
 */
export function exportOrdersToCSV(orders: Order[], customFilename?: string) {
  const today = new Date().toISOString().split("T")[0];
  const filename = customFilename || `طلبات-متجر-أحمد-بحري-${today}.csv`;

  const headers = [
    "رقم الفاتورة",
    "تاريخ ووقت الطلب",
    "اسم الزبون",
    "رقم الهاتف",
    "العنوان / المحافظة",
    "حالة الطلب",
    "تفاصيل المواد والقطع المطلوبة",
    "إجمالي عدد القطع",
    "مجموع المواد (د.ع)",
    "أجور التوصيل (د.ع)",
    "الإجمالي الكلي للفاتورة (د.ع)",
    "مدة التوصيل المحددة",
    "ملاحظات الطلب والمنصة",
  ];

  const rows = orders.map((order) => {
    const serial = formatInvoiceSerial(order);
    const dateFormatted = order.createdAt
      ? new Date(order.createdAt).toLocaleString("ar-IQ", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

    const itemsSummary = (order.items || [])
      .map((item) => `${item.name} (عدد: ${item.quantity} × ${item.retailPrice.toLocaleString()} د.ع)`)
      .join(" | ");

    const totalQuantity = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const subtotal = (order.items || []).reduce((sum, item) => sum + (item.retailPrice * item.quantity), 0);
    const deliveryFee = order.deliveryFee ?? 5000;
    const grandTotal = order.total || (subtotal + deliveryFee);
    const statusArabic = ORDER_STATUS_ARABIC[order.status] || order.status;

    return [
      serial,
      dateFormatted,
      order.customerName || "زبون",
      order.customerPhone || "—",
      order.customerAddress || "—",
      statusArabic,
      itemsSummary || "—",
      totalQuantity,
      subtotal,
      deliveryFee,
      grandTotal,
      order.deliveryDuration || "حسب المحافظة",
      order.notes || "—",
    ];
  });

  downloadCSV(filename, headers, rows);
}

/**
 * Bulk exports inventory products to CSV with full stock levels, supplier, and valuation data.
 */
export function exportInventoryToCSV(
  products: Product[],
  suppliers: Supplier[],
  thresholds?: { excellent: number; medium: number },
  customFilename?: string
) {
  const today = new Date().toISOString().split("T")[0];
  const filename = customFilename || `مخزون-متجر-أحمد-بحري-${today}.csv`;

  const maxStock = products.length > 0 ? Math.max(...products.map((p) => p.stock), 1) : 1;
  const t = thresholds || { excellent: 75, medium: 40 };

  const getStockLevelLabel = (stock: number) => {
    if (stock === 0) return "نفد من المخزون";
    const pct = (stock / maxStock) * 100;
    if (pct >= t.excellent) return "ممتاز";
    if (pct >= t.medium) return "متوسط";
    return "منخفض (يحتاج تعبئة)";
  };

  const headers = [
    "معرّف المنتج",
    "اسم المنتج / قطعة الغيار",
    "الملاحظات / التصنيف",
    "الكمية المتوفرة",
    "مستوى المخزون",
    "سعر التكلفة (د.ع)",
    "سعر الجملة (د.ع)",
    "سعر المفرد للزبون (د.ع)",
    "الربح المتوقع للقطعة بالمفرد (د.ع)",
    "إجمالي قيمة المخزون بسعر البيع (د.ع)",
    "إجمالي تكلفة المخزون (د.ع)",
    "اسم المورد",
    "هاتف المورد",
    "عنوان المورد",
  ];

  const rows = products.map((prod) => {
    const supplier = suppliers.find((s) => s.id === prod.supplierId);
    const stockLevel = getStockLevelLabel(prod.stock);
    const unitProfit = Math.max(0, (prod.retailPrice || 0) - (prod.costPrice || 0));
    const totalRetailVal = (prod.retailPrice || 0) * (prod.stock || 0);
    const totalCostVal = (prod.costPrice || 0) * (prod.stock || 0);

    return [
      prod.id,
      prod.name,
      prod.notes || "—",
      prod.stock,
      stockLevel,
      prod.costPrice || 0,
      prod.wholesalePrice || 0,
      prod.retailPrice || 0,
      unitProfit,
      totalRetailVal,
      totalCostVal,
      supplier ? supplier.name : "—",
      supplier ? supplier.phone : "—",
      supplier ? supplier.address || "—" : "—",
    ];
  });

  downloadCSV(filename, headers, rows);
}
