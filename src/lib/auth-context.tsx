"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";
import { UserRole } from "./types";

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
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
      return { error };
    } catch (e: unknown) {
      return { error: e as AuthError };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    }
  }, []);

  const guestLogin = useCallback((name: string, governorate: string) => {
    const guest: AuthUser = {
      id: `guest-${Date.now()}`,
      email: "",
      fullName: name,
      role: "customer" as UserRole,
      avatarUrl: "",
    };
    setUser(guest);
    if (typeof window !== "undefined") {
      localStorage.setItem("guest-user", JSON.stringify({ ...guest, governorate }));
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !user && !session) {
      const saved = localStorage.getItem("guest-user");
      if (saved) {
        try { setUser(JSON.parse(saved)); } catch {}
      }
    }
  }, [user, session]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, guestLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
