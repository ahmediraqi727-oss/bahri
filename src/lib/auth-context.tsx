"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";
import { UserRole } from "./types";
import { getCookie, setCookie, eraseCookie } from "./visitor-tracker";
import { updateGuestIdentity } from "./visitor-tracker";

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string;
  governorate?: string;
  isGuest?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  guestLogin: (name: string, governorate: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (authUser: User): Promise<AuthUser> => {
    try {
      const { data } = await supabase
        .from("users")
        .select("id, email, full_name, role, avatar_url")
        .eq("id", authUser.id)
        .maybeSingle();
      if (data) {
        return {
          id: data.id,
          email: data.email || authUser.email || "",
          fullName: data.full_name || authUser.user_metadata?.full_name || "مستخدم",
          role: (data.role as UserRole) || (authUser.user_metadata?.role as UserRole) || "customer",
          avatarUrl: data.avatar_url || "",
        };
      }
    } catch {
      // Ignore database errors and use session user metadata fallback
    }

    return {
      id: authUser.id,
      email: authUser.email || "",
      fullName: authUser.user_metadata?.full_name || "مستخدم",
      role: (authUser.user_metadata?.role as UserRole) || "customer",
      avatarUrl: "",
    };
  };

  useEffect(() => {
    let mounted = true;
    try {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (!mounted) return;
        setSession(s);
        if (s?.user) {
          fetchUserProfile(s.user).then((profile) => {
            if (mounted) {
              setUser(profile);
              setLoading(false);
            }
          }).catch(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setLoading(false);
        }
      }).catch(() => {
        if (mounted) setLoading(false);
      });

      const { data } = supabase.auth.onAuthStateChange(
        async (_event, s) => {
          if (!mounted) return;
          setSession(s);
          if (s?.user) {
            const profile = await fetchUserProfile(s.user);
            if (mounted) setUser(profile);
          } else {
            if (mounted) setUser(null);
          }
        }
      );

      return () => {
        mounted = false;
        data?.subscription?.unsubscribe();
      };
    } catch {
      if (mounted) setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: UserRole = "customer") => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
        },
      });
      if (!error && email) {
        updateGuestIdentity({ name: fullName, email });
      }
      return { error };
    } catch (e: unknown) {
      return { error: e as AuthError };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && email) {
        updateGuestIdentity({ email });
      }
      return { error };
    } catch (e: unknown) {
      return { error: e as AuthError };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://ahmed-bahri.vercel.app";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/dashboard`,
        },
      });
      return { error };
    } catch (e: unknown) {
      return { error: e as AuthError };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    setSession(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("guest-user");
      localStorage.removeItem("guestUser");
      eraseCookie("app_guest_user");
      window.dispatchEvent(new Event("guest-user-updated"));
    }
  }, []);

  const guestLogin = useCallback((name: string, governorate: string) => {
    const cleanName = name?.trim() || "ضيف عزيز";
    const cleanGov = governorate?.trim() || "";
    const guest: AuthUser = {
      id: `guest-${Date.now()}`,
      email: "",
      fullName: cleanName,
      governorate: cleanGov,
      role: "customer" as UserRole,
      avatarUrl: "",
      isGuest: true,
    };
    setUser(guest);
    if (typeof window !== "undefined") {
      localStorage.setItem("guest-user", JSON.stringify(guest));
      localStorage.setItem("guestUser", JSON.stringify({ name: cleanName, governorate: cleanGov }));
      setCookie("app_guest_user", JSON.stringify({ name: cleanName, governorate: cleanGov }), 365);
      window.dispatchEvent(new Event("guest-user-updated"));
    }
  }, []);

  useEffect(() => {
    const handleGuestUpdate = () => {
      if (typeof window === "undefined") return;
      const saved1 = localStorage.getItem("guest-user");
      const saved2 = localStorage.getItem("guestUser");
      const savedCookie = getCookie("app_guest_user");

      if (saved1) {
        try { setUser(JSON.parse(saved1)); } catch {}
      } else if (saved2) {
        try {
          const parsed = JSON.parse(saved2);
          setUser({
            id: `guest-${Date.now()}`,
            email: "",
            fullName: parsed.name || "ضيف عزيز",
            governorate: parsed.governorate || "",
            role: "customer" as UserRole,
            avatarUrl: "",
            isGuest: true,
          });
        } catch {}
      } else if (savedCookie) {
        try {
          const parsed = JSON.parse(savedCookie);
          const restoredGuest: AuthUser = {
            id: `guest-${Date.now()}`,
            email: "",
            fullName: parsed.name || "ضيف عزيز",
            governorate: parsed.governorate || "",
            role: "customer" as UserRole,
            avatarUrl: "",
            isGuest: true,
          };
          setUser(restoredGuest);
          localStorage.setItem("guest-user", JSON.stringify(restoredGuest));
          localStorage.setItem("guestUser", JSON.stringify({ name: parsed.name, governorate: parsed.governorate }));
        } catch {}
      }
    };

    handleGuestUpdate();

    if (typeof window !== "undefined") {
      window.addEventListener("guest-user-updated", handleGuestUpdate);
      return () => window.removeEventListener("guest-user-updated", handleGuestUpdate);
    }
  }, [session]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signInWithGoogle, signOut, guestLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
