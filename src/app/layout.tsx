import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "موقع أحمد بحري - متجر إلكتروني ونظام ERP",
  description: "نظام متكامل يجمع بين المتجر الإلكتروني ونظام إدارة المخزون والفواتير",
  icons: { icon: "/logo.jpg" },
  openGraph: { title: "موقع أحمد بحري", description: "متجر إلكتروني ونظام ERP متكامل", images: ["/logo.jpg"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
