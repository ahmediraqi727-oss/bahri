import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ydzqejyicqganldegust.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkenFlanlpY3FnYW5sZGVndXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzE1ODMsImV4cCI6MjA5OTk0NzU4M30.6_iebiri6e4OSE0kvvuyC7_gorXnonT058dCMWoIX-4";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

