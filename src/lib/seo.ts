import type { Metadata } from "next";
import { Product } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Site-wide Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_CONFIG = {
  name: "متجر أحمد بحري",
  nameEn: "Ahmed Bahri Store",
  tagline: "تجارة جملة ومفرد لقطع غيار الدراجات النارية والدراجات الكهربائية",
  description:
    "المنصة الأولى المتخصصة في تجارة الجملة والتجزئة لقطع غيار الدراجات النارية والدراجات الكهربائية والبطاريات والملحقات في كركوك وكافة المحافظات العراقية بأفضل الأسعار وخصومات الكميات.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://ahmed-bahri.vercel.app",
  logo: "https://ahmed-bahri.vercel.app/logo.jpg",
  ogImage: "https://ahmed-bahri.vercel.app/hero.jpg",
  city: "كركوك",
  country: "IQ",
  currency: "IQD",
  phone: "+9647800000000",
  baseKeywords: [
    "قطع غيار دراجات نارية",
    "قطع غيار دراجات كهربائية",
    "متجر أحمد بحري",
    "قطع غيار جملة كركوك",
    "إطارات دراجات نارية العراق",
    "بطاريات دراجات كهربائية",
    "تجارة جملة ومفرد كركوك",
    "قطع غيار اصلية",
    "Ahmed Bahri Store",
    "Motorcycle spare parts Iraq",
    "Electric bicycle spare parts Kirkuk",
  ],
  /** @deprecated Use baseKeywords */
  get keywords() {
    return this.baseKeywords;
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shared robots config — reused across all metadata generators
// ─────────────────────────────────────────────────────────────────────────────

const ROBOTS_CONFIG: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-video-preview": -1,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Store-level / Home Page Metadata
// ─────────────────────────────────────────────────────────────────────────────

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
  const description = override?.description ?? SITE_CONFIG.description;
  const image = override?.image ?? SITE_CONFIG.ogImage;
  const canonicalUrl = `${SITE_CONFIG.url}${override?.canonicalPath ?? ""}`;
  const keywords = Array.from(
    new Set([...SITE_CONFIG.baseKeywords, ...(override?.keywords ?? [])])
  );

  return {
    title,
    description,
    keywords,
    metadataBase: new URL(SITE_CONFIG.url),
    alternates: { canonical: canonicalUrl },
    robots: ROBOTS_CONFIG,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_CONFIG.name,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. Category Page Metadata
// ─────────────────────────────────────────────────────────────────────────────

/** Maps well-known Arabic category names to targeted keyword clusters */
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  "قطع غيار دراجات نارية": [
    "قطع غيار دراجات نارية كركوك",
    "قطع غيار موتوسيكل",
    "قطع غيار موتور كركوك",
    "قطع غيار دراجة نارية جملة",
  ],
  "قطع غيار دراجات كهربائية": [
    "قطع غيار دراجات كهربائية كركوك",
    "قطع غيار سكوتر كهربائي",
    "بطاريات دراجات كهربائية العراق",
    "قطع غيار ebike",
  ],
  "إطارات وجنوط": [
    "إطارات دراجات نارية كركوك",
    "جنوط موتوسيكل",
    "إطارات كهربائي جملة",
  ],
  "زيوت وشحوم": ["زيت موتور دراجة", "زيوت دراجات نارية العراق"],
  "بطاريات وشواحن": [
    "بطاريات دراجة كهربائية",
    "شواحن سكوتر كهربائي",
    "بطاريات موتوسيكل كركوك",
  ],
};

export function generateCategoryMetadata(categoryName: string): Metadata {
  const extraKeywords =
    CATEGORY_KEYWORD_MAP[categoryName] ?? [
      `${categoryName} جملة كركوك`,
      `${categoryName} بأفضل سعر`,
    ];

  const title = `${categoryName} | ${SITE_CONFIG.name} - جملة ومفرد`;
  const description =
    `تسوق ${categoryName} الأصلية بأفضل الأسعار وخصومات الكميات في متجر أحمد بحري ` +
    `بكركوك. جملة ومفرد، توصيل لجميع المحافظات العراقية.`;

  const canonicalUrl = `${SITE_CONFIG.url}/?category=${encodeURIComponent(categoryName)}`;
  const keywords = Array.from(
    new Set([...SITE_CONFIG.baseKeywords, ...extraKeywords, categoryName])
  );

  return {
    title,
    description,
    keywords,
    metadataBase: new URL(SITE_CONFIG.url),
    alternates: { canonical: canonicalUrl },
    robots: ROBOTS_CONFIG,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_CONFIG.name,
      images: [{ url: SITE_CONFIG.ogImage, width: 1200, height: 630, alt: title }],
      locale: "ar_IQ",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description, images: [SITE_CONFIG.ogImage] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Post / Article Page Metadata
// ─────────────────────────────────────────────────────────────────────────────

interface PostForMeta {
  id: string;
  title: string;
  body: string;
  media_url?: string | null;
  post_type?: "educational" | "promotional";
  created_at?: string;
}

export function generatePostMetadata(post: PostForMeta): Metadata {
  const title = `${post.title} | ${SITE_CONFIG.name}`;
  const description =
    post.body.slice(0, 160).replace(/\n/g, " ").trim() ||
    `اقرأ أحدث منشورات متجر أحمد بحري - ${post.title}`;
  const image = post.media_url ?? SITE_CONFIG.ogImage;
  const canonicalUrl = `${SITE_CONFIG.url}/posts?id=${post.id}`;
  const typeKeyword =
    post.post_type === "educational"
      ? "تعليم ونصائح دراجات"
      : "عروض وتخفيضات قطع غيار";

  return {
    title,
    description,
    keywords: [...SITE_CONFIG.baseKeywords, typeKeyword, post.title],
    metadataBase: new URL(SITE_CONFIG.url),
    alternates: { canonical: canonicalUrl },
    robots: ROBOTS_CONFIG,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_CONFIG.name,
      images: [{ url: image, width: 1200, height: 630, alt: post.title }],
      locale: "ar_IQ",
      type: "article",
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Image Alt-Text Utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a rich, SEO-compliant alt attribute for product images.
 * Combines part name, optional category, and store branding for
 * maximum Google Image Search discoverability.
 *
 * @example
 * generateProductAltText(product, "إطارات وجنوط")
 * // → "قطع غيار دراجات نارية - Titan 120 إطار أمامي - إطارات وجنوط | متجر أحمد بحري كركوك"
 */
export function generateProductAltText(
  product: Pick<Product, "name" | "notes">,
  category?: string | null
): string {
  const categoryPart = category
    ? category
    : extractCategoryFromNotes(product.notes);
  return `قطع غيار دراجات نارية - ${product.name} - ${categoryPart} | متجر أحمد بحري كركوك`;
}

/** Extracts category name from product notes field (e.g. "الفئة: إطارات وجنوط | ...") */
export function extractCategoryFromNotes(notes?: string | null): string {
  if (!notes) return "قطع غيار اصلية";
  const match = notes.match(/الفئة:\s*([^|]+)/);
  return match?.[1]?.trim() ?? "قطع غيار اصلية";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Product JSON-LD Schema (Rich Snippets)
// ─────────────────────────────────────────────────────────────────────────────

export function generateProductJsonLd(product: Product, category?: string | null) {
  const imageUrl =
    product.image && product.image.startsWith("http")
      ? product.image
      : `${SITE_CONFIG.url}/${product.image?.replace(/^\//, "") || "hero.jpg"}`;

  const description =
    product.notes ||
    `${product.name} - قطع غيار اصلية عالية الجودة متوفرة لدى ${SITE_CONFIG.name} بكركوك.`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: [imageUrl],
    description,
    sku: product.id,
    mpn: product.id,
    brand: { "@type": "Brand", name: SITE_CONFIG.name },
    category: category ?? extractCategoryFromNotes(product.notes),
    offers: {
      "@type": "Offer",
      url: `${SITE_CONFIG.url}/?product=${product.id}`,
      priceCurrency: "IQD",
      price: product.retailPrice,
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      itemCondition: "https://schema.org/NewCondition",
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: SITE_CONFIG.name },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Store JSON-LD Schema (LocalBusiness / AutoPartsStore)
// ─────────────────────────────────────────────────────────────────────────────

export function generateStoreJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "AutoPartsStore",
    "@id": `${SITE_CONFIG.url}/#store`,
    name: SITE_CONFIG.name,
    alternateName: SITE_CONFIG.nameEn,
    url: SITE_CONFIG.url,
    logo: SITE_CONFIG.logo,
    image: SITE_CONFIG.ogImage,
    description: SITE_CONFIG.description,
    telephone: SITE_CONFIG.phone,
    priceRange: "$$",
    currenciesAccepted: "IQD, USD",
    paymentAccepted: "Cash, Credit Card, ZainCash",
    address: {
      "@type": "PostalAddress",
      streetAddress: "الشارع التجاري الرئيسي",
      addressLocality: "كركوك",
      addressRegion: "محافظة كركوك",
      addressCountry: "IQ",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: "35.4681",
      longitude: "44.3922",
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "08:00",
        closes: "22:00",
      },
    ],
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_CONFIG.url}/?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
    sameAs: ["https://facebook.com", "https://instagram.com"],
  };
}
