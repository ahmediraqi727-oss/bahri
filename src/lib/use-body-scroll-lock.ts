"use client";

import { useEffect } from "react";

let activeLockCount = 0;
let savedScrollY = 0;

function applyGlobalScrollLock() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (activeLockCount === 0) {
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add("modal-scroll-locked");
    document.body.classList.add("modal-scroll-locked");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const dashboardMain = document.querySelector("main");
    if (dashboardMain instanceof HTMLElement) {
      dashboardMain.dataset.lockedScrollTop = String(dashboardMain.scrollTop);
      dashboardMain.classList.add("modal-scroll-locked");
      dashboardMain.style.overflowY = "hidden";
    }
  }
  activeLockCount++;
}

function releaseGlobalScrollLock() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  activeLockCount = Math.max(0, activeLockCount - 1);
  if (activeLockCount === 0) {
    document.documentElement.classList.remove("modal-scroll-locked");
    document.body.classList.remove("modal-scroll-locked");
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    const dashboardMain = document.querySelector("main");
    if (dashboardMain instanceof HTMLElement) {
      dashboardMain.classList.remove("modal-scroll-locked");
      dashboardMain.style.overflowY = "";
      if (dashboardMain.dataset.lockedScrollTop !== undefined) {
        dashboardMain.scrollTop = Number(dashboardMain.dataset.lockedScrollTop) || 0;
        delete dashboardMain.dataset.lockedScrollTop;
      }
    }

    if (savedScrollY > 0) {
      window.scrollTo(0, savedScrollY);
    }
  }
}

/**
 * قفل تمرير الصفحة الخلفية تلقائياً عند فتح أي نافذة منبثقة (Modal)
 * وإعادة تفعيل التمرير في الموضع نفسه فور إغلاق النافذة.
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;
    applyGlobalScrollLock();
    return () => {
      releaseGlobalScrollLock();
    };
  }, [isLocked]);
}

/**
 * مراقب ذكي لتخطيط لوحة التحكم يقفل تمرير الصفحة الخلفية تلقائياً
 * بمجرد ظهور أي نافذة منبثقة (fixed inset-0 / role="dialog" / data-modal-overlay)
 * ويعيد التمرير الطبيعي فور إغلاق كافة النوافذ المنبثقة.
 */
export function useAutoDashboardModalScrollLock() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let autoLocked = false;

    const checkOpenModals = () => {
      // البحث عن أي نافذة منبثقة مفتوحة تغطي الشاشة في لوحة التحكم
      const candidates = document.querySelectorAll(
        '[role="dialog"], [data-modal-overlay="true"], div.fixed.inset-0'
      );

      let hasActiveModal = false;
      candidates.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        // استثناء خلفية القائمة الجانبية للهواتف في حال كانت مخفية
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return;
        }
        const zIndex = parseInt(style.zIndex || "0", 10);
        if (
          el.getAttribute("role") === "dialog" ||
          el.dataset.modalOverlay === "true" ||
          zIndex >= 45
        ) {
          hasActiveModal = true;
        }
      });

      if (hasActiveModal && !autoLocked) {
        autoLocked = true;
        applyGlobalScrollLock();
      } else if (!hasActiveModal && autoLocked) {
        autoLocked = false;
        releaseGlobalScrollLock();
      }
    };

    checkOpenModals();

    const observer = new MutationObserver(() => {
      checkOpenModals();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "role", "data-modal-overlay"],
    });

    return () => {
      observer.disconnect();
      if (autoLocked) {
        autoLocked = false;
        releaseGlobalScrollLock();
      }
    };
  }, []);
}
