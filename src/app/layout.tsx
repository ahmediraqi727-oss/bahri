import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoPartsStore",
  "name": "متجر أحمد بحري",
  "alternateName": "Ahmed Bahri Store",
  "url": "https://ahmed-bahri.vercel.app",
  "logo": "https://ahmed-bahri.vercel.app/logo.jpg",
  "image": "https://ahmed-bahri.vercel.app/hero.jpg",
  "description": "المنصة الرائدة لتجارة الجملة والتجزئة لقطع غيار الدراجات النارية والدراجات الكهربائية بأفضل الأسعار وخصومات الكميات.",
  "currenciesAccepted": "IQD, USD",
  "paymentAccepted": "Cash, Credit Card, ZainCash",
  "priceRange": "$$",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "الشارع الرئيسي",
    "addressLocality": "كركوك",
    "addressRegion": "كركوك",
    "addressCountry": "IQ"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "35.4681",
    "longitude": "44.3922"
  },
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ],
    "opens": "08:00",
    "closes": "22:00"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://ahmed-bahri.vercel.app/?search={search_term_string}",
    "query-input": "required name=search_term_string"
  },
  "sameAs": [
    "https://wa.me/",
    "https://t.me/"
  ]
};

export const metadata: Metadata = {
  title: "متجر أحمد بحري | تجارة قطع غيار الدراجات النارية والكهربائية",
  description: "المنصة الرائدة لتجارة الجملة والتجزئة لقطع غيار الدراجات النارية والدراجات الكهربائية بأفضل الأسعار وخصومات الكميات.",
  icons: { icon: "/logo.jpg" },
  verification: {
    google: "google-site-verification: googleea26b5a095faa157.html",
  },
  openGraph: {
    title: "متجر أحمد بحري - Ahmed Bahri Store",
    description: "المنصة الرائدة لتجارة الجملة والتجزئة لقطع غيار الدراجات النارية والدراجات الكهربائية بأفضل الأسعار وخصومات الكميات.",
    url: "https://ahmed-bahri.vercel.app",
    siteName: "متجر أحمد بحري",
    images: [{ url: "https://ahmed-bahri.vercel.app/hero.jpg" }, { url: "https://ahmed-bahri.vercel.app/logo.jpg" }],
    locale: "ar_IQ",
    type: "website",
  },
  metadataBase: new URL("https://ahmed-bahri.vercel.app"),
  alternates: {
    canonical: "https://ahmed-bahri.vercel.app",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="google-site-verification: googleea26b5a095faa157.html" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

