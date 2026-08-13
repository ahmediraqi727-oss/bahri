import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_OUTPUT_MODE === "export" ? { output: "export" } : {}),
  // Transpile Capacitor and other modern packages so older Android WebViews
  // (which may not support ES2022+ syntax like object destructuring spread,
  //  optional chaining, etc.) can run the app without Syntax Errors.
  transpilePackages: [
    "@capacitor/core",
    "@capacitor/splash-screen",
    "@capacitor/status-bar",
    "@capacitor/push-notifications",
    "@capacitor/android",
  ],

  // Webpack configuration for maximum WebView compatibility
  webpack(config, { isServer }) {
    if (!isServer) {
      // Target ES5-compatible output for Android WebView compatibility
      config.target = ["web", "es5"];
    }
    return config;
  },

  // Compiler options: use SWC (faster, built-in to Next.js)
  compiler: {
    // Remove console.log in production for performance
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
  },

  // Allow images from any origin and optimize with AVIF/WebP formats
  images: {
    unoptimized: process.env.NEXT_OUTPUT_MODE === "export",
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },

  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
