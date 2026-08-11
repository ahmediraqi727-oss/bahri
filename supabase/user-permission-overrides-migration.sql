-- ==============================================================================
-- USER-LEVEL PERMISSION OVERRIDES MIGRATION
-- Ahmed Bahri Store — Dual-Layer RBAC Architecture v1.0
-- Run this in Supabase SQL Editor
-- ==============================================================================

-- ─── 1. Create user_permission_overrides table ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT UNIQUE NOT NULL,
  user_email   TEXT,
  user_name    TEXT,
  permissions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ─── 2. Row Level Security & Access Grants ────────────────────────────────────

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to user_permission_overrides" ON public.user_permission_overrides;
CREATE POLICY "Allow all access to user_permission_overrides"
  ON public.user_permission_overrides
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.user_permission_overrides TO authenticated, anon, public;

-- ─── 3. Auto-update trigger for updated_at ───────────────────────────────────

DROP TRIGGER IF EXISTS trg_user_permission_overrides_updated_at ON public.user_permission_overrides;
CREATE TRIGGER trg_user_permission_overrides_updated_at
  BEFORE UPDATE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. Reload schema cache ──────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
