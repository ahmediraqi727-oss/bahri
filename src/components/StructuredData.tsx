"use client";

import React from "react";
import { Product } from "@/lib/types";
import { generateProductJsonLd, generateStoreJsonLd } from "@/lib/seo";

interface StructuredDataProps {
  product?: Product | null;
  breadcrumbs?: Array<{ name: string; item: string }>;
}

export default function StructuredData({ product, breadcrumbs }: StructuredDataProps) {
  const storeSchema = generateStoreJsonLd();
  const productSchema = product ? generateProductJsonLd(product) : null;

  const breadcrumbSchema = breadcrumbs && breadcrumbs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": crumb.name,
      "item": crumb.item.startsWith("http") ? crumb.item : `https://ahmed-bahri.vercel.app${crumb.item}`
    }))
  } : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(storeSchema) }}
      />
      {productSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
      )}
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
    </>
  );
}
