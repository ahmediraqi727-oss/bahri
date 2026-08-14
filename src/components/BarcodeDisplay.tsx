"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import Barcode from "react-barcode";

export interface BarcodeDisplayProps {
  barcode?: string | null;
  qrCode?: string | null;
  productName?: string;
  compact?: boolean;
}

export const BarcodeDisplay: React.FC<BarcodeDisplayProps> = ({
  barcode,
  qrCode,
  productName,
  compact = false,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (qrCode) {
      QRCode.toDataURL(qrCode, { width: 150, margin: 1 }, (err, url) => {
        if (!err && url) {
          setQrDataUrl(url);
        }
      });
    } else {
      setQrDataUrl("");
    }
  }, [qrCode]);

  if (!barcode && !qrCode) return null;

  return (
    <div className={`flex ${compact ? "flex-row gap-3 items-center" : "flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 gap-4"}`}>
      {/* عرض الباركود الخطي 1D */}
      {barcode && (
        <div className="bg-white p-2 rounded-lg overflow-hidden shadow-xs border border-gray-100 flex flex-col items-center">
          <Barcode value={barcode} width={1.5} height={45} fontSize={12} margin={0} />
        </div>
      )}

      {/* عرض الـ QR Code بصورة صحيحة */}
      {qrDataUrl && (
        <div className="flex flex-col items-center gap-1">
          <img src={qrDataUrl} alt={productName || "QR Code"} className="w-24 h-24 object-contain bg-white p-1 rounded-lg border border-gray-200 shadow-xs" />
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">{qrCode}</span>
        </div>
      )}
    </div>
  );
};

export default BarcodeDisplay;
