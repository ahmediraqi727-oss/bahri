/**
 * @file rls-check.test.ts
 * @description اختبار التأكد من منع الضيوف من قراءة الطلبات
 */

import { createClient } from '@supabase/supabase-js';

// تعريف أدوات الاختبار القياسية لدعم مجمع TypeScript المستقل وتوثيق مخرجات التشغيل
const describe = (name: string, fn: () => void | Promise<void>) => {
  console.log(`\n🧪 **مجموعة اختبارات: ${name}**`);
  return fn();
};

const test = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
};

const expect = <T,>(actual: T) => ({
  toBe: (expected: T) => {
    if (actual !== expected) throw new Error(`توقعت ${expected} ولكن وجد ${actual}`);
  },
  toContain: (expected: string) => {
    if (typeof actual === "string" && !actual.includes(expected)) {
      throw new Error(`توقعت أن تحتوي ${actual} على ${expected}`);
    }
  },
  not: {
    toBeNull: () => {
      if (actual === null) throw new Error(`توقعت القيمة ألا تكون null ولكنها كانت null`);
    },
    toBe: (expected: T) => {
      if (actual === expected) throw new Error(`توقعت القيمة ألا تكون ${expected}`);
    },
  },
});

describe("فحص أمان متجر أحمد بحري (RLS)", () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ydzqejyicqganldegust.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkenFlanlpY3FnYW5sZGVndXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzE1ODMsImV4cCI6MjA5OTk0NzU4M30.6_iebiri6e4OSE0kvvuyC7_gorXnonT058dCMWoIX-4";

  test("التاكد من ان الضيف (غير المسجل) لا يمكنه قراءة جدول الطلبات", async () => {
    // محاكاة بيئة WebSocket لبيئات Node.js < 22 عند استخدام Supabase Client
    if (typeof (globalThis as any).WebSocket === 'undefined') {
      (globalThis as any).WebSocket = class {};
    }

    // إنشاء عملاء بصلاحيات الضيف العادي (Anon)
    const anonSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonSupabase.from('orders').select('*');

    // بما أن الحماية مفعلة، يجب أن يرفض النظام الطلب أو لا يعيد أي بيانات للضيف
    console.log("نتيجة محاولة قراءة الضيف للطلبات:", { data, error });
    
    // إما أن ينتج خطأ صلاحيات أو تكون البيانات فارغة تماماً
    const isProtected = error !== null || !data || data.length === 0;
    expect(isProtected).toBe(true);
  });
});
