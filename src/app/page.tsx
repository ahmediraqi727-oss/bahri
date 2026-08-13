// src/app/page.tsx — Server Component wrapper with generateMetadata
// All client-side interactivity lives in HomeClient.tsx

import type { Metadata } from "next";
import { supabase } from "@/lib/supabase-client";
import { generateStoreMetadata, generateCategoryMetadata, SITE_CONFIG } from "@/lib/seo";
import HomeClient from "./HomeClient";

// ─────────────────────────────────────────────────────────────────────────────
// generateMetadata — runs server-side at build/request time
// Reads searchParams to produce per-category and per-product Open Graph metadata
// ─────────────────────────────────────────────────────────────────────────────

interface PageSearchParams {
  category?: string;
  product?: string;
  search?: string;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;

  // Category view — generate targeted Arabic keyword metadata
  if (params.category) {
    return generateCategoryMetadata(params.category);
  }

  // Product modal — fetch from Supabase for rich OpenGraph title+description
  if (params.product) {
    try {
      const { data: product } = await supabase
        .from("products")
        .select("id, name, notes, image, retailPrice, stock")
        .eq("id", params.product)
        .single();

      if (product) {
        const categoryMatch = product.notes?.match(/الفئة:\s*([^|]+)/);
        const category = categoryMatch?.[1]?.trim() ?? "قطع غيار اصلية";
        const imageUrl =
          product.image && product.image.startsWith("http")
            ? product.image
            : SITE_CONFIG.ogImage;

        return generateStoreMetadata({
          title: `${product.name} - ${category}`,
          description:
            product.notes
              ? `${product.name} - ${product.notes.slice(0, 120)} | سعر: ${product.retailPrice?.toLocaleString()} د.ع. متوفر في متجر أحمد بحري بكركوك.`
              : `${product.name} - قطع غيار اصلية متوفرة بسعر ${product.retailPrice?.toLocaleString()} د.ع. في متجر أحمد بحري بكركوك.`,
          image: imageUrl,
          canonicalPath: `/?product=${product.id}`,
          keywords: [product.name, category, "قطع غيار اصلية"],
        });
      }
    } catch {
      // Fallback to store-level metadata if product fetch fails
    }
  }

  // Search view — generate search-context metadata
  if (params.search) {
    return generateStoreMetadata({
      title: `نتائج البحث: ${params.search}`,
      description: `نتائج البحث عن "${params.search}" في متجر أحمد بحري لقطع غيار الدراجات النارية والكهربائية بكركوك.`,
      canonicalPath: `/?search=${encodeURIComponent(params.search)}`,
      keywords: [params.search, "بحث قطع غيار", "متجر أحمد بحري"],
    });
  }

  // Default home page metadata
  return generateStoreMetadata();
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Component — thin server shell, delegates all rendering to HomeClient
// ─────────────────────────────────────────────────────────────────────────────

export default function Page() {
  return <HomeClient />;
}
