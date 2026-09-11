// Node 20 compatibility polyfill for Supabase Realtime in CLI test runner
class DummyWebSocket {}
(globalThis as any).WebSocket = DummyWebSocket;
(global as any).WebSocket = DummyWebSocket;

import fs from "fs";
import path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(message);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function runTests() {
  console.log("🚀 Starting Dual-Pane Fast Scanner Automated Tests...\n");

  const { processCodeFilter } = await import("../components/DualPaneFastScanner");

  // 1. Check DualPaneFastScanner file existence
  const componentPath = path.join(__dirname, "../components/DualPaneFastScanner.tsx");
  assert(fs.existsSync(componentPath), "DualPaneFastScanner.tsx file exists in src/components/");

  // 2. Test Smart URL Filter & Internal Link Extractor
  console.log("\n🔍 Testing Smart QR URL Filter & Internal Code Extractor:");

  // Test Case A: Foreign External Website (should be ignored)
  const extResult1 = processCodeFilter("https://www.google.com/search?q=autoparts");
  assert(extResult1.isExternal === true, "External URL (google.com) identified as external");

  const extResult2 = processCodeFilter("http://malicious-site.xyz/fake-qr");
  assert(extResult2.isExternal === true, "External URL (http scheme) identified as external");

  // Test Case B: Internal Store Link (should extract product code / ID)
  const intResult1 = processCodeFilter("https://ahmed-bahri.vercel.app/qr/6221234567890");
  assert(intResult1.isExternal === false, "Internal store QR URL recognized as internal");
  assert(intResult1.extractedCode === "6221234567890", "Extracted EAN-13 code from internal QR URL correctly");

  const intResult2 = processCodeFilter("https://ahmed-bahri.store/product/PROD-Brake-Pad-123");
  assert(intResult2.isExternal === false, "Internal product page URL recognized as internal");
  assert(intResult2.extractedCode === "PROD-Brake-Pad-123", "Extracted product ID from internal link correctly");

  // Test Case C: Standard Barcode / QR String (should pass unchanged)
  const stdResult = processCodeFilter("6220001234567");
  assert(stdResult.isExternal === false, "Standard EAN-13 barcode recognized as non-external");
  assert(stdResult.extractedCode === "6220001234567", "Standard barcode content preserved");

  // 3. Verify Integration in Header & BarcodeManagementHub
  console.log("\n🔗 Testing System Integrations:");

  const headerPath = path.join(__dirname, "../components/Header.tsx");
  const headerContent = fs.readFileSync(headerPath, "utf-8");
  assert(headerContent.includes("DualPaneFastScanner"), "Header.tsx imports DualPaneFastScanner component");
  assert(headerContent.includes("dashboard-dual-pane-scanner-btn"), "Header.tsx contains Dual-Pane trigger button");

  const hubPath = path.join(__dirname, "../components/BarcodeManagementHub.tsx");
  const hubContent = fs.readFileSync(hubPath, "utf-8");
  assert(hubContent.includes("DualPaneFastScanner"), "BarcodeManagementHub.tsx imports DualPaneFastScanner component");
  assert(hubContent.includes("Dual-Pane"), "BarcodeManagementHub.tsx contains Dual-Pane launcher button");

  console.log("\n🎉 All Dual-Pane Fast Scanner Automated Tests Passed Successfully!");
}

runTests().catch((err) => {
  console.error("\n❌ Test execution failed:", err);
  process.exit(1);
});
