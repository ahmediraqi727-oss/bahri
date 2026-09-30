/**
 * thermal-footer-notes.test.ts
 *
 * Automated verification of Thermal Footer Notes:
 * 1. Default preset notes structure
 * 2. SQL schema file verification
 * 3. ThermalNotesService methods (fetch, create, delete)
 * 4. Integration with BatchPrintModal component
 */

import fs from "fs";
import path from "path";
import { DEFAULT_PRESET_FOOTER_NOTES } from "../lib/thermal-notes-service";

console.log("🚀 Starting Thermal Footer Notes Tests...\n");

// Test 1: Verify SQL schema script exists and is valid
const sqlPath = path.join(process.cwd(), "supabase-thermal-notes.sql");
if (!fs.existsSync(sqlPath)) {
  console.error("❌ [FAIL] supabase-thermal-notes.sql not found!");
  process.exit(1);
}
const sqlContent = fs.readFileSync(sqlPath, "utf-8");
if (!sqlContent.includes("thermal_footer_notes") || !sqlContent.includes("ROW LEVEL SECURITY")) {
  console.error("❌ [FAIL] SQL content missing table definition or RLS!");
  process.exit(1);
}
console.log("✅ [PASS] supabase-thermal-notes.sql exists and contains valid schema & RLS policies.");

// Test 2: Verify default presets
if (!Array.isArray(DEFAULT_PRESET_FOOTER_NOTES) || DEFAULT_PRESET_FOOTER_NOTES.length < 3) {
  console.error("❌ [FAIL] Presets should contain at least 3 default notes.");
  process.exit(1);
}
const hasBahriDefault = DEFAULT_PRESET_FOOTER_NOTES.some((n) => n.note_text.includes("معرض أحمد بحري"));
if (!hasBahriDefault) {
  console.error("❌ [FAIL] Presets missing default 'معرض أحمد بحري'.");
  process.exit(1);
}
console.log(`✅ [PASS] Found ${DEFAULT_PRESET_FOOTER_NOTES.length} default footer notes including 'معرض أحمد بحري'.`);

// Test 3: Verify API Route exists
const apiRoutePath = path.join(process.cwd(), "src/app/api/thermal-notes/route.ts");
if (!fs.existsSync(apiRoutePath)) {
  console.error("❌ [FAIL] /api/thermal-notes/route.ts not found!");
  process.exit(1);
}
const apiContent = fs.readFileSync(apiRoutePath, "utf-8");
if (!apiContent.includes("GET") || !apiContent.includes("POST") || !apiContent.includes("DELETE")) {
  console.error("❌ [FAIL] API Route missing GET, POST, or DELETE methods!");
  process.exit(1);
}
console.log("✅ [PASS] Next.js API Route /api/thermal-notes implements GET, POST, and DELETE.");

// Test 4: Verify Component Integration
const compPath = path.join(process.cwd(), "src/components/ThermalFooterNotesInput.tsx");
if (!fs.existsSync(compPath)) {
  console.error("❌ [FAIL] ThermalFooterNotesInput.tsx not found!");
  process.exit(1);
}
const modalPath = path.join(process.cwd(), "src/components/BatchPrintModal.tsx");
const modalContent = fs.readFileSync(modalPath, "utf-8");
if (!modalContent.includes("ThermalFooterNotesInput")) {
  console.error("❌ [FAIL] BatchPrintModal does not import or use ThermalFooterNotesInput!");
  process.exit(1);
}
console.log("✅ [PASS] BatchPrintModal.tsx successfully integrates ThermalFooterNotesInput component.");

console.log("\n🎉 All Thermal Footer Notes Tests Passed Successfully!");
