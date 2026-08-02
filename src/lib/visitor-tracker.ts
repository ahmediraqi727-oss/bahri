"use client";

import { supabase } from "./supabase-client";
import { CustomerRecord } from "./types";

const VISITOR_ID_KEY = "app_visitor_id";
const WELCOME_MODAL_SHOWN_KEY = "app_visitor_welcome_dismissed";

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "vis_ssr";
  let vid = localStorage.getItem(VISITOR_ID_KEY);
  if (!vid) {
    vid = `vis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(VISITOR_ID_KEY, vid);
  }
  return vid;
}

export function detectDeviceType(): string {
  if (typeof window === "undefined") return "حاسوب";
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "تابلت";
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i.test(ua)) return "هاتف";
  return "حاسوب";
}

export function isWelcomeModalDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(WELCOME_MODAL_SHOWN_KEY) === "true";
}

export function markWelcomeModalDismissed(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(WELCOME_MODAL_SHOWN_KEY, "true");
  }
}

export async function trackVisitorSession(pageName: string = "/"): Promise<CustomerRecord | null> {
  if (typeof window === "undefined") return null;

  try {
    const visitorId = getOrCreateVisitorId();
    const deviceType = detectDeviceType();

    // Check if visitor already exists in Supabase
    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("visitor_id", visitorId)
      .maybeSingle();

    if (existing) {
      const prevPages = Array.isArray(existing.visited_pages) ? existing.visited_pages : [];
      const updatedPages = prevPages.includes(pageName) ? prevPages : [...prevPages, pageName];
      const newCount = (Number(existing.visit_count) || 1) + 1;

      const { data: updated } = await supabase
        .from("customers")
        .update({
          visit_count: newCount,
          device_type: deviceType,
          last_active_at: new Date().toISOString(),
          visited_pages: updatedPages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .maybeSingle();

      if (updated) {
        return rowToCustomer(updated);
      }
    } else {
      // Get total customers count to assign "مجهول X"
      const { count } = await supabase.from("customers").select("*", { count: "exact", head: true });
      const anonNumber = (count || 0) + 1;
      const defaultName = `مجهول ${anonNumber}`;

      const newCustomerRow = {
        visitor_id: visitorId,
        name: defaultName,
        device_type: deviceType,
        visit_count: 1,
        last_active_at: new Date().toISOString(),
        visited_pages: [pageName],
        is_blocked: false,
        is_registered: false,
      };

      const { data: inserted, error } = await supabase
        .from("customers")
        .insert(newCustomerRow)
        .select()
        .maybeSingle();

      if (error) {
        console.warn("Visitor insert warning:", error.message);
      }

      if (inserted) {
        return rowToCustomer(inserted);
      }
    }
  } catch (err) {
    console.warn("Visitor tracking exception:", err);
  }

  return null;
}

export async function updateGuestIdentity(identity: {
  name?: string;
  phone?: string;
  city?: string;
  governorate?: string;
  address?: string;
  email?: string;
}): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const visitorId = getOrCreateVisitorId();
    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("visitor_id", visitorId)
      .maybeSingle();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (identity.name && identity.name.trim() && !identity.name.startsWith("مجهول")) {
      updatePayload.name = identity.name.trim();
    }
    if (identity.phone) updatePayload.phone = identity.phone.trim();
    if (identity.city) updatePayload.city = identity.city.trim();
    if (identity.governorate) updatePayload.governorate = identity.governorate.trim();
    if (identity.address) updatePayload.address = identity.address.trim();
    if (identity.email) {
      updatePayload.email = identity.email.trim();
      updatePayload.is_registered = true;
    }

    if (existing) {
      await supabase.from("customers").update(updatePayload).eq("id", existing.id);
    } else {
      const { count } = await supabase.from("customers").select("*", { count: "exact", head: true });
      const anonNumber = (count || 0) + 1;
      const defaultName = identity.name?.trim() || `مجهول ${anonNumber}`;

      await supabase.from("customers").insert({
        visitor_id: visitorId,
        name: defaultName,
        phone: identity.phone || "",
        city: identity.city || "",
        governorate: identity.governorate || identity.address || "",
        address: identity.address || "",
        email: identity.email || "",
        device_type: detectDeviceType(),
        visit_count: 1,
        last_active_at: new Date().toISOString(),
        visited_pages: ["/"],
        is_blocked: false,
        is_registered: Boolean(identity.email),
      });
    }

    return true;
  } catch (err) {
    console.error("updateGuestIdentity error:", err);
    return false;
  }
}

export function rowToCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    id: (row.id as string) || "",
    visitorId: (row.visitor_id as string) || "",
    name: (row.name as string) || "مجهول",
    phone: (row.phone as string) || "",
    city: (row.city as string) || "",
    governorate: (row.governorate as string) || (row.address as string) || "",
    address: (row.address as string) || "",
    email: (row.email as string) || "",
    userId: (row.user_id as string) || undefined,
    deviceType: (row.device_type as string) || "حاسوب",
    visitCount: Number(row.visit_count) || 1,
    lastActiveAt: (row.last_active_at as string) || (row.created_at as string) || new Date().toISOString(),
    visitedPages: Array.isArray(row.visited_pages) ? (row.visited_pages as string[]) : [],
    isBlocked: Boolean(row.is_blocked),
    isRegistered: Boolean(row.is_registered),
    notes: (row.notes as string) || "",
    createdAt: (row.created_at as string) || new Date().toISOString(),
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
  };
}
