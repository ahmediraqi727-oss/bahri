"use client";

import { isUUID } from "./data-context";

const SERIAL_STORAGE_KEY = "ahmed_bahri_guest_serial";
const SERIAL_TIME_KEY = "ahmed_bahri_guest_serial_time";
const GUEST_STORAGE_KEY = "ahmed_bahri_guest_session";
const GUEST_TIME_KEY = "ahmed_bahri_guest_time";
const EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days

/**
 * Enterprise Dual-Identity Model:
 * Generates and returns a persistent unique session ID for guest visitors.
 */
export function getOrCreateGuestSessionId(): string {
  if (typeof window === "undefined") return "server_guest_session";

  const now = Date.now();
  const savedTime = localStorage.getItem(SERIAL_TIME_KEY) || localStorage.getItem(GUEST_TIME_KEY);
  let serialId = localStorage.getItem(SERIAL_STORAGE_KEY) || localStorage.getItem(GUEST_STORAGE_KEY);

  if (!serialId || !savedTime || now - Number(savedTime) > EXPIRATION_MS) {
    serialId = "guest_sess_" + Math.random().toString(36).substring(2) + "_" + now.toString(36);
    localStorage.setItem(SERIAL_STORAGE_KEY, serialId);
    localStorage.setItem(SERIAL_TIME_KEY, now.toString());
    localStorage.setItem(GUEST_STORAGE_KEY, serialId);
    localStorage.setItem(GUEST_TIME_KEY, now.toString());
  }

  return serialId;
}

export function clearGuestSessionId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SERIAL_STORAGE_KEY);
  localStorage.removeItem(SERIAL_TIME_KEY);
  localStorage.removeItem(GUEST_STORAGE_KEY);
  localStorage.removeItem(GUEST_TIME_KEY);
  localStorage.removeItem("store_guest_session_id");
}

export interface ActiveIdentity {
  isRegistered: boolean;
  id: string;
  storagePrefix: string;
}

/**
 * Returns the current active identity (Registered User vs Guest Visitor)
 */
export function getActiveIdentity(user?: any): ActiveIdentity {
  const isRegistered = Boolean(
    user?.id &&
    typeof user.id === "string" &&
    isUUID(user.id) &&
    !user.isGuest &&
    !user.id.startsWith("guest-")
  );

  if (isRegistered) {
    return {
      isRegistered: true,
      id: user.id,
      storagePrefix: `user_${user.id}`,
    };
  }

  const guestId = getOrCreateGuestSessionId();
  return {
    isRegistered: false,
    id: guestId,
    storagePrefix: `guest_${guestId}`,
  };
}

/**
 * Returns an isolated localStorage key scoped strictly to the current identity
 */
export function getIsolatedStorageKey(keyBase: string, user?: any): string {
  const identity = getActiveIdentity(user);
  return `${keyBase}_${identity.storagePrefix}`;
}
