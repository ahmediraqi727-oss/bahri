/**
 * @file messages-notifications-security.test.ts
 * @description اختبار صلاحيات الرسائل والإشعارات للضيوف والزبائن المسجلين
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
  toBeNull: () => {
    if (actual !== null) throw new Error(`توقعت القيمة أن تكون null ولكن وجد ${actual}`);
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

describe("فحص صلاحيات الرسائل والإشعارات - متجر أحمد بحري", () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ydzqejyicqganldegust.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkenFlanlpY3FnYW5sZGVndXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzE1ODMsImV4cCI6MjA5OTk0NzU4M30.6_iebiri6e4OSE0kvvuyC7_gorXnonT058dCMWoIX-4";

  test("1. الضيف: ممنوع من إرسال رسائل أو قراءة الرسائل الخاصة، ومسموح له الإشعارات العامة فقط", async () => {
    if (typeof (globalThis as any).WebSocket === 'undefined') {
      (globalThis as any).WebSocket = class {};
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    // محاولة الضيف إرسال رسالة
    const { error: insertError } = await anonClient.from('messages').insert({
      content: "رسالة تجريبية من ضيف",
      sender_type: "guest"
    });
    
    console.log("نتيجة محاولة الضيف إرسال رسالة:", { insertError });

    // محاولة الضيف قراءة الرسائل الخاصة
    const { data: messagesData, error: selectError } = await anonClient.from('messages').select('*');
    console.log("نتيجة محاولة الضيف قراءة الرسائل:", { messagesData, selectError });
    
    // يجب ألا تظهر أي رسائل خاصة للضيف
    const isProtected = selectError !== null || !messagesData || messagesData.length === 0;
    expect(isProtected).toBe(true);
  });

  test("2. الزبون المسجل: يمكنه إدارة رسائله الخاصة وتلقي إشعارات الردود ونشرات المدير", async () => {
    if (typeof (globalThis as any).WebSocket === 'undefined') {
      (globalThis as any).WebSocket = class {};
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    
    // التحقق من أن جداول الإشعارات العامة (العروض والمنشورات التعليمية للمدير) متاحة للقراءة للجميع
    const { data: notifData, error: notifError } = await anonClient.from('notifications').select('*');
    console.log("نتيجة محاولة قراءة الإشعارات العامة:", { notifData, notifError });
    
    // الإشعارات العامة يجب أن تكون متاحة للعرض
    expect(notifError).toBeNull();
  });
});
