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
  }, [settings]);

  const { right, center, left, fullWidth } = footerSettings;

  // 🛡️ Enhanced Robust Social Links Mapping with Custom Vivid Colors & Icons
  const socialLinks = [
    {
      cond: Boolean(settings.facebookLink && settings.facebookLink.trim() !== ""),
      label: "فيسبوك",
      url: settings.facebookLink,
      icon: "📘",
      className: "bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60",
    },
    {
      cond: Boolean(settings.instagramLink && settings.instagramLink.trim() !== ""),
      label: "انستغرام",
      url: settings.instagramLink,
      icon: "📸",
      className: "bg-pink-50 dark:bg-pink-950/60 hover:bg-gradient-to-r hover:from-pink-600 hover:to-purple-600 hover:text-white text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800/60",
    },
    {
      cond: Boolean(settings.tiktokLink && settings.tiktokLink.trim() !== ""),
      label: "تيك توك",
      url: settings.tiktokLink,
      icon: "🎵",
      className: "bg-gray-100 dark:bg-gray-800 hover:bg-black hover:text-white text-gray-900 dark:text-white border-gray-300 dark:border-gray-700",
    },
    {
      cond: Boolean(settings.youtubeLink && settings.youtubeLink.trim() !== ""),
      label: "يوتيوب",
      url: settings.youtubeLink,
      icon: "▶️",
      className: "bg-red-50 dark:bg-red-950/60 hover:bg-red-600 hover:text-white text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60",
    },
    {
      cond: Boolean(settings.telegramLink && settings.telegramLink.trim() !== ""),
      label: "تليجرام",
      url: settings.telegramLink?.startsWith("http")
        ? settings.telegramLink
        : settings.telegramLink?.startsWith("@")
        ? `https://t.me/${settings.telegramLink.slice(1)}`
        : `https://t.me/${settings.telegramLink}`,
      icon: "✈️",
      className: "bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-500 hover:text-white text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800/60",
    },
    {
      cond: Boolean(settings.messengerLink && settings.messengerLink.trim() !== ""),
      label: "ماسنجر",
      url: settings.messengerLink?.startsWith("http")
        ? settings.messengerLink
        : `https://m.me/${settings.messengerLink?.replace("@", "")}`,
      icon: "⚡",
      className: "bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-500 hover:text-white text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60",
    },
    {
      cond: Boolean(settings.whatsappLink && settings.whatsappLink.trim() !== ""),
      label: "واتساب",
      url: settings.whatsappLink?.startsWith("http")
        ? settings.whatsappLink
        : `https://wa.me/${settings.whatsappLink?.replace(/[^0-9]/g, "")}`,
      icon: "💬",
      className: "bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-600 hover:text-white text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60",
    },
    {
      cond: Boolean(settings.phoneLink && settings.phoneLink.trim() !== ""),
      label: settings.phoneLink,
      url: `tel:${settings.phoneLink}`,
      icon: "📞",
      className: "bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-600 hover:text-white text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60",
    },
    {
      cond: Boolean(settings.phoneLink2 && settings.phoneLink2.trim() !== ""),
      label: settings.phoneLink2,
      url: `tel:${settings.phoneLink2}`,
      icon: "☎️",
      className: "bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-600 hover:text-white text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60",
    },
  ].filter((link) => link.cond);

  const hasAppLinks = Boolean(footerSettings.showAppDownloadLinks && (settings.androidAppUrl || settings.iosAppUrl));

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
      {/* ─── 1. Full-Width Span Banner ─── */}
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
                style={{ width: `${right.imageWidth}px`, height: `${right.imageHeight}px` }}
              >
                <Image src={right.imageUrl} alt={right.title || "شعار المتجر"} fill sizes={`${right.imageWidth}px`} className="object-contain" />
              </div>
            )}
            {right.text && (
              <p className="font-medium text-gray-600 dark:text-gray-300 leading-relaxed" style={{ fontSize: `${right.fontSize}px` }}>
                {right.text}
              </p>
            )}
            {right.linkUrl && (
              <a href={right.linkUrl} target={right.linkUrl.startsWith("http") ? "_blank" : "_self"} rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1">
                <span>المزيد التفاصيل</span><span>←</span>
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
                style={{ width: `${center.imageWidth}px`, height: `${center.imageHeight}px` }}
              >
                <Image src={center.imageUrl} alt={center.title || settings.siteName} fill sizes={`${center.imageWidth}px`} className="object-contain p-1" />
              </div>
            ) : settings.logo ? (
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-md">
                <Image src={settings.logo} alt={settings.siteName} fill className="object-cover" />
              </div>
            ) : null}
            {center.title && <h3 className="font-extrabold text-base text-gray-900 dark:text-white">{center.title}</h3>}
            {center.text && (
              <p className="font-extrabold text-gray-900 dark:text-white leading-relaxed max-w-sm" style={{ fontSize: `${center.fontSize}px` }}>
                {center.text}
              </p>
            )}
            {center.linkUrl && (
              <a href={center.linkUrl} target={center.linkUrl.startsWith("http") ? "_blank" : "_self"} rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                <span>رابط الخدمة المباشر</span><span>🔗</span>
              </a>
            )}
          </div>
        )}

        {/* Left Section */}
        {left.enabled && (
          <div className="flex flex-col items-center md:items-end text-center md:text-left space-y-3">
            {left.title && (
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
                <span>{left.title}</span><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              </h3>
            )}
            {left.imageUrl && (
              <div
                className="relative overflow-hidden rounded-xl shadow-sm border border-gray-100 dark:border-gray-800"
                style={{ width: `${left.imageWidth}px`, height: `${left.imageHeight}px` }}
              >
                <Image src={left.imageUrl} alt={left.title || "تواصل معنا"} fill sizes={`${left.imageWidth}px`} className="object-contain" />
              </div>
            )}
            {left.text && (
              <p className="font-bold text-gray-700 dark:text-gray-200 leading-relaxed" style={{ fontSize: `${left.fontSize}px` }}>
                {left.text}
              </p>
            )}
            {left.linkUrl && (
              <a href={left.linkUrl} target={left.linkUrl.startsWith("http") ? "_blank" : "_self"} rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all hover:scale-[1.02]">
                <span>📞</span><span>تواصل معنا الآن</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* ─── 3. Fully Responsive Social Media & Contacts Sub-Bar (Fixed for Mobile & Tablet) ─── */}
      {((footerSettings.showSocialLinks && socialLinks.length > 0) || hasAppLinks) && (
        <div
          className="max-w-7xl mx-auto mt-6 pt-6 border-t border-gray-100 dark:border-gray-800/80"
          style={{
            paddingLeft: `${footerSettings.containerPaddingX}px`,
            paddingRight: `${footerSettings.containerPaddingX}px`,
          }}
        >
          <div className="flex flex-col gap-4">
            {footerSettings.showSocialLinks && socialLinks.length > 0 && (
              <>
                <span className="text-sm font-extrabold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <span>🌐</span> تابعنا على وسائل التواصل الاجتماعي:
                </span>

                {/* Adaptive Grid Layout that guarantees display across Mobile, Tablet, and Desktop */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 w-full">
                  {socialLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url!}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-2xs active:scale-95 ${link.className}`}
                    >
                      <span className="shrink-0">{link.icon}</span>
                      <span className="truncate">{link.label}</span>
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* App Store Download Badges */}
            {hasAppLinks && (
              <div className="flex items-center justify-center sm:justify-start gap-3 pt-2 flex-wrap text-xs">
                <span className="font-extrabold text-gray-700 dark:text-gray-300">تطبيق الهاتف:</span>
                {settings.androidAppUrl && (
                  <a
                    href={settings.androidAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold transition-all border border-emerald-200 dark:border-emerald-800 shadow-2xs active:scale-95"
                  >
                    <span>🤖</span> أندرويد
                  </a>
                )}
                {settings.iosAppUrl && (
                  <a
                    href={settings.iosAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-900 hover:text-white text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-all border border-gray-300 dark:border-gray-700 shadow-2xs active:scale-95"
                  >
                    <span>🍎</span> آيفون
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}
