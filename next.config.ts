import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

  // Allow images from any origin (needed for Supabase storage URLs)
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },

  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
