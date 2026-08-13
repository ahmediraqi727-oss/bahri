import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase-client";

export const revalidate = 3600; // Revalidate sitemap at most once per hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ahmed-bahri.vercel.app";

  // 1. Static Core Store Routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/posts`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  // Core Category Filters for Search Engine Indexing
  const coreCategories = [
    "قطع غيار دراجات نارية",
    "قطع غيار دراجات كهربائية",
    "إطارات وجنوط",
    "زيوت وشحوم",
    "بطاريات وشواحن",
    "ملحقات وإكسسوارات"
  ];

  const categoryRoutes: MetadataRoute.Sitemap = coreCategories.map((cat) => ({
    url: `${baseUrl}/?category=${encodeURIComponent(cat)}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.85,
  }));

  // 2. Fetch Active Products Dynamically from Supabase safely
  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, updated_at, created_at, is_deleted");

    if (!error && Array.isArray(products) && products.length > 0) {
      productRoutes = products
        .filter((product) => !product.is_deleted)
        .map((product) => {
          const rawDate = product.updated_at || product.created_at;
          const lastModified = rawDate ? new Date(rawDate) : new Date();
          return {
            url: `${baseUrl}/?product=${product.id}`,
            lastModified: isNaN(lastModified.getTime()) ? new Date() : lastModified,
            changeFrequency: "weekly" as const,
            priority: 0.75,
          };
        });
    }
  } catch (err) {
    console.error("Sitemap: Error fetching products from Supabase:", err);
  }

  // 3. Fetch Posts/Educational Content Dynamically from Supabase safely
  let postRoutes: MetadataRoute.Sitemap = [];
  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select("id, created_at");

    if (!error && Array.isArray(posts) && posts.length > 0) {
      postRoutes = posts.map((post) => {
        const lastModified = post.created_at ? new Date(post.created_at) : new Date();
        return {
          url: `${baseUrl}/posts?id=${post.id}`,
          lastModified: isNaN(lastModified.getTime()) ? new Date() : lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.65,
        };
      });
    }
  } catch (err) {
    console.error("Sitemap: Error fetching posts from Supabase:", err);
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...postRoutes];
}

