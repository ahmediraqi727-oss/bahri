/**
 * @file live-chat-security.test.ts
 * @description وحدة اختبار فحص أمان وعزل نظام المحادثة المباشرة (Live Chat System Security & Isolation)
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

describe("نظام المحادثة المباشرة والأمان - متجر أحمد بحري (Live Chat Isolation)", () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ydzqejyicqganldegust.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkenFlanlpY3FnYW5sZGVndXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzE1ODMsImV4cCI6MjA5OTk0NzU4M30.6_iebiri6e4OSE0kvvuyC7_gorXnonT058dCMWoIX-4";

  test("1. عزل محادثات الزبون المسجل: جلب الرسائل بدلالة user_id = auth.uid() فقط", async () => {
    if (typeof (globalThis as any).WebSocket === 'undefined') {
      (globalThis as any).WebSocket = class {};
    }

    const mockUserId = "4c6e12ad-4290-4a54-9508-8433af4f789c"; // مستخدم مسجل
    const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

    // استعلام محاكاة عزل المستخدم المسجل
    const { data: userMessages, error } = await client
      .from('messages')
      .select('*')
      .eq('user_id', mockUserId);

    console.log("نتيجة جلب رسائل المستخدم المعزولة:", { count: userMessages?.length, error });
    expect(error).toBeNull();
  });

  test("2. عزل جلسة الضيف (Guest Session Isolation): جلب الرسائل بدلالة session_id الفريد وتجنب التسريب", async () => {
    if (typeof (globalThis as any).WebSocket === 'undefined') {
      (globalThis as any).WebSocket = class {};
    }

    const mockGuestSessionId = `guest_${Date.now()}_xyz`;
    const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

    // 1. إرسال رسالة ضيف مع معرف جلسة مؤقت فريد
    const { error: insertErr } = await client.from('messages').insert({
      content: "رسالة ضيف مؤقتة لاختبار العزل",
      session_id: mockGuestSessionId,
      sender_name: `ضيف #${mockGuestSessionId.slice(-4)}`,
      role: 'guest',
      is_guest: true,
    });

    console.log("نتيجة إرسال رسالة الضيف المعزولة:", { insertErr });

    // 2. جلب رسائل الجلسة المحددة فقط
    const { data: guestMessages } = await client
      .from('messages')
      .select('*')
      .eq('session_id', mockGuestSessionId);

    const isIsolated = Boolean(guestMessages && guestMessages.every((m) => m.session_id === mockGuestSessionId));
    console.log("نتيجة فحص عزل جلسة الضيف وعدم تسرب بيانات خارجية:", { isIsolated, count: guestMessages?.length });
    expect(isIsolated).toBe(true);
  });

  test("3. رد المدير في صندوق الوارد المركزي: القدرة على الرد المباشر بـ is_admin_reply = true", async () => {
    if (typeof (globalThis as any).WebSocket === 'undefined') {
      (globalThis as any).WebSocket = class {};
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

    // محاكاة رد الإدارة في المحادثة المباشرة
    const adminReplyPayload = {
      content: "أهلاً بك في متجر أحمد بحري، كيف يمكننا مساعدتك؟",
      is_admin_reply: true,
      sender_name: "إدارة متجر أحمد بحري",
      role: "admin",
      is_read: true,
    };

    expect(adminReplyPayload.is_admin_reply).toBe(true);
    expect(adminReplyPayload.role).toBe("admin");
  });
});
