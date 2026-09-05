import React from "react";

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(message);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function runTests() {
  console.log("🚀 Starting Barcode, Camera & Smart Linking Tests...");

  // 1. Check ProductLinkModal component file existence
  const fs = require("fs");
  const path = require("path");
  const modalPath = path.join(__dirname, "../components/ProductLinkModal.tsx");
  assert(fs.existsSync(modalPath), "ProductLinkModal.tsx file exists");

  // 2. Check ProductModal enhanced camera triggers
  const productModalPath = path.join(__dirname, "../components/ProductModal.tsx");
  const productModalContent = fs.readFileSync(productModalPath, "utf-8");
  assert(productModalContent.includes("BarcodeScanner"), "ProductModal imports BarcodeScanner component");
  assert(productModalContent.includes("initialBarcode"), "ProductModal accepts initialBarcode prop");
  assert(productModalContent.includes("activeScannerField"), "ProductModal has activeScannerField state for field scanning");

  // 3. Check ScannerProductModal unrecognized modal dual buttons
  const scannerModalPath = path.join(__dirname, "../components/ScannerProductModal.tsx");
  const scannerModalContent = fs.readFileSync(scannerModalPath, "utf-8");
  assert(scannerModalContent.includes("onRequestLink"), "ScannerProductModal accepts onRequestLink prop");
  assert(scannerModalContent.includes("إدخال / ربط بمنتج"), "ScannerProductModal renders 'إدخال / ربط بمنتج' button");

  // 4. Check ProductLinkModal collision detection & options
  const linkModalContent = fs.readFileSync(modalPath, "utf-8");
  assert(linkModalContent.includes("collisionWarning"), "ProductLinkModal includes collision detection logic");
  assert(linkModalContent.includes("assignBarcodeToProduct"), "ProductLinkModal calls assignBarcodeToProduct service");
  assert(linkModalContent.includes("onCreateNew"), "ProductLinkModal supports creating a new product with the scanned code");

  console.log("\n🎉 All Barcode, Camera & Smart Linking Tests Passed Successfully!");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
