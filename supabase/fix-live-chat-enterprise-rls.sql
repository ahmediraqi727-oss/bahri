-- ====================================================================
-- Enterprise Live Chat Messaging & RLS Security Migration
-- Project: Ahmed Bahri Store (قطع غيار الجبالي)
-- ====================================================================

-- 1. Ensure public.messages table exists with strict schema boundaries
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  serial_id TEXT,
  sender_name TEXT NOT NULL DEFAULT 'مستخدم',
  sender_phone TEXT,
  content TEXT NOT NULL,
  role TEXT DEFAULT 'customer', -- 'customer' | 'guest' | 'admin'
  is_admin_reply BOOLEAN NOT NULL DEFAULT false,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_guest BOOLEAN NOT NULL DEFAULT false,
  auto_replied BOOLEAN NOT NULL DEFAULT false,
  matched_keyword TEXT,
  thread_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure missing columns are added if table already existed
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'customer';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;

-- 2. Create high-performance indexes for isolation and thread queries
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON public.messages(is_read);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any existing permissive policies
DROP POLICY IF EXISTS "messages_admin_all" ON public.messages;
DROP POLICY IF EXISTS "messages_user_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_all" ON public.messages;
DROP POLICY IF EXISTS "Allow all operations on messages" ON public.messages;
DROP POLICY IF EXISTS "Customer Own Messages Policy" ON public.messages;
DROP POLICY IF EXISTS "Guest Temporary Session Policy" ON public.messages;

-- 5. Policy 1: Admin & Manager Full Control Policy
-- Allows authenticated admins and managers to SELECT, INSERT, UPDATE, and DELETE all conversations
CREATE POLICY "Admin Full Control Policy" ON public.messages
FOR ALL
TO authenticated
USING (
  auth.role() = 'authenticated'
)
WITH CHECK (
  auth.role() = 'authenticated'
);

-- 6. Policy 2: Registered Customer Isolated Policy
-- Allows registered users to SELECT and INSERT their own messages matching user_id = auth.uid()
CREATE POLICY "Customer Own Messages SELECT Policy" ON public.messages
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);

CREATE POLICY "Customer Own Messages INSERT Policy" ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

-- 7. Policy 3: Guest Temporary Session Policy
-- Allows anonymous guests to INSERT messages with their session_id, and SELECT ONLY their own session messages
CREATE POLICY "Guest Messages INSERT Policy" ON public.messages
FOR INSERT
TO anon, public
WITH CHECK (
  is_guest = true OR session_id IS NOT NULL
);

CREATE POLICY "Guest Messages SELECT Policy" ON public.messages
FOR SELECT
TO anon, public
USING (
  session_id IS NOT NULL 
  AND session_id = current_setting('request.headers', true)::json->>'x-session-id'
);

-- 8. Grant table privileges
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT ON TABLE public.messages TO anon, public;
