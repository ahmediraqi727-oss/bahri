import type { Metadata } from "next";
import { Product } from "@/lib/types";

export const SITE_CONFIG = {
  name: "متجر أحمد بحري",
  nameEn: "Ahmed Bahri Store",
  tagline: "تجارة جملة ومفرد لقطع غيار الدراجات النارية والدراجات الكهربائية",
  description: "المنصة الأولى المتخصصة في تجارة الجملة والتجزئة لقطع غيار الدراجات النارية والدراجات الكهربائية والبطاريات والملحقات في كركوك وكافة المحافظات العراقية بأفضل الأسعار وخصومات الكميات.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://ahmed-bahri.vercel.app",
  logo: "https://ahmed-bahri.vercel.app/logo.jpg",
  ogImage: "https://ahmed-bahri.vercel.app/hero.jpg",
  city: "كركوك",
  country: "IQ",
  currency: "IQD",
  phone: "+9647800000000",
  keywords: [
    "قطع غيار دراجات نارية",
    "قطع غيار دراجات كهربائية",
    "متجر أحمد بحري",
    "قطع غيار جملة كركوك",
    "إطارات دراجات نارية العراق",
    "بطاريات دراجات كهربائية",
    "تجارة جملة ومفرد كركوك",
    "Ahmed Bahri Store",
    "Motorcycle spare parts Iraq",
    "Electric bicycle spare parts Kirkuk"
  ],
};

/**
 * Enterprise SEO helper to generate dynamic, keyword-rich Metadata objects for Next.js App Router pages.
 */
export function generateStoreMetadata(override?: {
  title?: string;
  description?: string;
  image?: string;
  canonicalPath?: string;
  keywords?: string[];
}): Metadata {
  const title = override?.title
    ? `${override.title} | ${SITE_CONFIG.name}`
    : `${SITE_CONFIG.name} | ${SITE_CONFIG.tagline}`;
  const description = override?.description || SITE_CONFIG.description;
  const image = override?.image || SITE_CONFIG.ogImage;
  const canonicalUrl = `${SITE_CONFIG.url}${override?.canonicalPath || ""}`;
  const keywords = Array.from(new Set([...SITE_CONFIG.keywords, ...(override?.keywords || [])]));

  return {
    title,
    description,
    keywords,
    metadataBase: new URL(SITE_CONFIG.url),
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_CONFIG.name,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: "ar_IQ",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/**
 * Structured Data Generator for Individual Product Schema (Google Rich Snippets)
 */
export function generateProductJsonLd(product: Product) {
  const imageUrl = product.image && product.image.startsWith("http")
    ? product.image
    : `${SITE_CONFIG.url}${product.image && product.image.startsWith("/") ? "" : "/"}${product.image || "hero.jpg"}`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "image": [imageUrl],
    "description": product.notes || `${product.name} - قطع غيار عالي الجودة متوفر لدى متجر أحمد بحري كركوك.`,
    "sku": product.id,
    "mpn": product.id,
    "brand": {
      "@type": "Brand",
      "name": "متجر أحمد بحري"
    },
    "offers": {
      "@type": "Offer",
      "url": `${SITE_CONFIG.url}/?product=${product.id}`,
      "priceCurrency": "IQD",
      "price": product.retailPrice,
      "priceValidUntil": new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      "itemCondition": "https://schema.org/NewCondition",
      "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "seller": {
        "@type": "Organization",
        "name": SITE_CONFIG.name
      }
    }
  };
}

/**
 * Structured Data Generator for AutoPartsStore / LocalBusiness Schema
 */
export function generateStoreJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "AutoPartsStore",
    "@id": `${SITE_CONFIG.url}/#store`,
    "name": SITE_CONFIG.name,
    "alternateName": SITE_CONFIG.nameEn,
    "url": SITE_CONFIG.url,
    "logo": SITE_CONFIG.logo,
    "image": SITE_CONFIG.ogImage,
    "description": SITE_CONFIG.description,
    "telephone": SITE_CONFIG.phone,
    "priceRange": "$$",
    "currenciesAccepted": "IQD, USD",
    "paymentAccepted": "Cash, Credit Card, ZainCash",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "الشارع التجاري الرئيسي",
      "addressLocality": "كركوك",
      "addressRegion": "محافظة كركوك",
      "addressCountry": "IQ"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": "35.4681",
      "longitude": "44.3922"
    },
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "opens": "08:00",
        "closes": "22:00"
      }
    ],
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${SITE_CONFIG.url}/?search={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    },
    "sameAs": [
      "https://facebook.com",
      "https://instagram.com"
    ]
  };
}
