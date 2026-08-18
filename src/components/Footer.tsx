"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSettings } from "@/lib/settings-context";
import { supabase } from "@/lib/supabase-client";
import {
  FooterSettings,
  DEFAULT_FOOTER_SETTINGS,
  rowToFooterSettings,
} from "@/lib/footer-types";

export default function Footer() {
  const { settings } = useSettings();
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(DEFAULT_FOOTER_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load dynamic footer settings from Supabase database `footer_settings` table
  useEffect(() => {
    async function loadFooterDb() {
      try {
        const { data, error } = await supabase
          .from("footer_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle();

        if (data && !error) {
          setFooterSettings(rowToFooterSettings(data));
        } else {
          // Fallback to legacy SiteSettings if footer_settings row doesn't exist yet
          setFooterSettings((prev) => ({
            ...prev,
            footerMinHeight: settings.footerHeight || prev.footerMinHeight,
            right: { ...prev.right, text: settings.footerRightText || prev.right.text },
            center: { ...prev.center, text: settings.footerCenterText || prev.center.text, imageUrl: settings.footerImage || settings.logo || prev.center.imageUrl },
            left: { ...prev.left, text: settings.footerLeftText || prev.left.text, linkUrl: settings.phoneLink ? `tel:${settings.phoneLink}` : prev.left.linkUrl },
          }));
        }
      } catch (err) {
        console.warn("Footer settings fetch fallback:", err);
      } finally {
        setLoading(false);
      }
    }
    loadFooterDb();

    // Supabase Real-Time Settings Subscription for Footer
    const channel = supabase
      .channel("public:footer_settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "footer_settings" },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            setFooterSettings(rowToFooterSettings(payload.new));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    settings.footerHeight,
    settings.footerRightText,
    settings.footerCenterText,
    settings.footerLeftText,
    settings.footerImage,
    settings.logo,
    settings.phoneLink,
  ]);

  const { right, center, left, fullWidth } = footerSettings;

  return (
    <footer
      className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-colors text-gray-700 dark:text-gray-200 relative overflow-hidden"
      style={{
        minHeight: `${footerSettings.footerMinHeight}px`,
        paddingTop: `${footerSettings.containerPaddingY}px`,
        paddingBottom: `${footerSettings.containerPaddingY}px`,
      }}
      dir="rtl"
    >
      {/* ─── 1. Full-Width Span Banner (وضع العرض الكامل) ─── */}
      {fullWidth.enabled && (
        <div
          className="w-full py-4 px-6 mb-8 rounded-2xl shadow-sm transition-all text-center sm:text-right border border-gray-200/20"
          style={{
            backgroundColor: fullWidth.bgColor || "#1e293b",
            color: fullWidth.textColor || "#ffffff",
          }}
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="space-y-1">
              {fullWidth.title && (
                <h4 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                  <span aria-hidden="true">📌</span>
                  <span>{fullWidth.title}</span>
                </h4>
              )}
              {fullWidth.text && (
                <p
                  className="font-medium opacity-90 leading-relaxed max-w-4xl"
                  style={{ fontSize: `${fullWidth.fontSize}px` }}
                >
                  {fullWidth.text}
                </p>
              )}
            </div>
            <Link
              href="/posts"
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold whitespace-nowrap transition-colors border border-white/20"
            >
              التفاصيل والمزيد ←
            </Link>
          </div>
        </div>
      )}

      {/* ─── 2. Multi-Zone Column Layout Grid ─── */}
      <div
        className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 items-start"
        style={{
          paddingLeft: `${footerSettings.containerPaddingX}px`,
          paddingRight: `${footerSettings.containerPaddingX}px`,
        }}
      >
        {/* Right Section */}
        {right.enabled && (
          <div className="flex flex-col items-center md:items-start text-center md:text-right space-y-3">
            {right.title && (
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                <span>{right.title}</span>
              </h3>
            )}

            {right.imageUrl && (
              <div
                className="relative overflow-hidden rounded-xl shadow-sm border border-gray-100 dark:border-gray-800"
                style={{
                  width: `${right.imageWidth}px`,
                  height: `${right.imageHeight}px`,
                }}
              >
                <Image
                  src={right.imageUrl}
                  alt={right.title || "شعار المتجر"}
                  fill
                  sizes={`${right.imageWidth}px`}
                  className="object-contain"
                />
              </div>
            )}

            {right.text && (
              <p
                className="font-medium text-gray-600 dark:text-gray-300 leading-relaxed"
                style={{ fontSize: `${right.fontSize}px` }}
              >
                {right.text}
              </p>
            )}

            {right.linkUrl && (
              <a
                href={right.linkUrl}
                target={right.linkUrl.startsWith("http") ? "_blank" : "_self"}
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1"
              >
                <span>المزيد التفاصيل</span>
                <span>←</span>
              </a>
            )}
          </div>
        )}

        {/* Center Section */}
        {center.enabled && (
          <div className="flex flex-col items-center text-center space-y-3">
            {center.imageUrl ? (
              <div
                className="relative overflow-hidden rounded-2xl shadow-md border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800"
                style={{
                  width: `${center.imageWidth}px`,
                  height: `${center.imageHeight}px`,
                }}
              >
                <Image
                  src={center.imageUrl}
                  alt={center.title || settings.siteName}
                  fill
                  sizes={`${center.imageWidth}px`}
                  className="object-contain p-1"
                />
              </div>
            ) : settings.logo ? (
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-md">
                <Image src={settings.logo} alt={settings.siteName} fill className="object-cover" />
              </div>
            ) : null}

            {center.title && (
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                {center.title}
              </h3>
            )}

            {center.text && (
              <p
                className="font-extrabold text-gray-900 dark:text-white leading-relaxed max-w-sm"
                style={{ fontSize: `${center.fontSize}px` }}
              >
                {center.text}
              </p>
            )}

            {center.linkUrl && (
              <a
                href={center.linkUrl}
                target={center.linkUrl.startsWith("http") ? "_blank" : "_self"}
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <span>رابط الخدمة المباشر</span>
                <span>🔗</span>
              </a>
            )}
          </div>
        )}

        {/* Left Section */}
        {left.enabled && (
          <div className="flex flex-col items-center md:items-end text-center md:text-left space-y-3">
            {left.title && (
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
                <span>{left.title}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              </h3>
            )}

            {left.imageUrl && (
              <div
                className="relative overflow-hidden rounded-xl shadow-sm border border-gray-100 dark:border-gray-800"
                style={{
                  width: `${left.imageWidth}px`,
                  height: `${left.imageHeight}px`,
                }}
              >
                <Image
                  src={left.imageUrl}
                  alt={left.title || "تواصل معنا"}
                  fill
                  sizes={`${left.imageWidth}px`}
                  className="object-contain"
                />
              </div>
            )}

            {left.text && (
              <p
                className="font-bold text-gray-700 dark:text-gray-200 leading-relaxed"
                style={{ fontSize: `${left.fontSize}px` }}
              >
                {left.text}
              </p>
            )}

            {left.linkUrl && (
              <a
                href={left.linkUrl}
                target={left.linkUrl.startsWith("http") ? "_blank" : "_self"}
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all hover:scale-[1.02]"
              >
                <span>📞</span>
                <span>تواصل معنا الآن</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* ─── 3. Social Media & Store Links Sub-Bar (100% Mobile & Desktop Responsive) ─── */}
      {(footerSettings.showSocialLinks || footerSettings.showAppDownloadLinks) && (
        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-gray-100 dark:border-gray-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-gray-500 dark:text-gray-400 w-full max-w-full overflow-x-auto">
          {footerSettings.showSocialLinks && (
            <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-start w-full sm:w-auto">
              <span className="text-gray-700 dark:text-gray-300 font-extrabold shrink-0 flex items-center gap-1">
                <span>🌐</span>
                <span>تابعنا على وسائل التواصل الاجتماعي:</span>
              </span>
              
              {(settings.facebookLink || true) && (
                <a
                  href={settings.facebookLink || "https://facebook.com"}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold transition-all border border-blue-200 dark:border-blue-800/60 flex items-center gap-1 shadow-2xs shrink-0"
                >
                  <span>📘</span> فيسبوك
                </a>
              )}

              {(settings.instagramLink || true) && (
                <a
                  href={settings.instagramLink || "https://instagram.com"}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-pink-50 dark:bg-pink-950/60 hover:bg-gradient-to-r hover:from-pink-600 hover:to-purple-600 hover:text-white text-pink-600 dark:text-pink-400 rounded-xl text-xs font-bold transition-all border border-pink-200 dark:border-pink-800/60 flex items-center gap-1 shadow-2xs shrink-0"
                >
                  <span>📸</span> انستغرام
                </a>
              )}

              {settings.tiktokLink && (
                <a
                  href={settings.tiktokLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-black hover:text-white text-gray-900 dark:text-white rounded-xl text-xs font-bold transition-all border border-gray-300 dark:border-gray-700 flex items-center gap-1 shadow-2xs shrink-0"
                >
                  <span>🎵</span> تيك توك
                </a>
              )}

              {settings.youtubeLink && (
                <a
                  href={settings.youtubeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-red-50 dark:bg-red-950/60 hover:bg-red-600 hover:text-white text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition-all border border-red-200 dark:border-red-800/60 flex items-center gap-1 shadow-2xs shrink-0"
                >
                  <span>▶️</span> يوتيوب
                </a>
              )}
            </div>
          )}

          {footerSettings.showAppDownloadLinks && (settings.androidAppUrl || settings.iosAppUrl) && (
            <div className="flex items-center gap-2 flex-wrap justify-center shrink-0">
              <span className="text-gray-700 dark:text-gray-300 font-extrabold">تطبيق الهاتف:</span>
              {settings.androidAppUrl && (
                <a
                  href={settings.androidAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold transition-all border border-emerald-200 dark:border-emerald-800 flex items-center gap-1"
                >
                  <span>🤖</span> أندرويد
                </a>
              )}
              {settings.iosAppUrl && (
                <a
                  href={settings.iosAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-900 hover:text-white text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-all border border-gray-300 dark:border-gray-700 flex items-center gap-1"
                >
                  <span>🍎</span> آيفون
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </footer>
  );
}
