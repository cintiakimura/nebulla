-- Multi-tenant schema for kyn hosted SaaS (kyn.app).
-- Run in Supabase SQL Editor. All tables scoped by user_id; RLS enforces auth.uid().

-- User metadata (id = auth.uid() from Supabase Auth; sync from webhook)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_pro BOOLEAN NOT NULL DEFAULT false,
  plan TEXT,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_until TIMESTAMPTZ,
  grok_calls_today INTEGER NOT NULL DEFAULT 0,
  grok_calls_date DATE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add paid_until if table already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'paid_until') THEN
    ALTER TABLE public.users ADD COLUMN paid_until TIMESTAMPTZ;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE public.users ADD COLUMN stripe_customer_id TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'stripe_subscription_id') THEN
    ALTER TABLE public.users ADD COLUMN stripe_subscription_id TEXT;
  END IF;
END $$;

-- RLS: users can read/update own row only
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = id);
-- Service role (backend) can insert/update for webhooks
CREATE POLICY "users_service_all" ON public.users FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Projects (one per user; backend uses service_role and filters by user_id)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled',
  status TEXT NOT NULL DEFAULT 'Draft',
  last_edited TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  package_json TEXT NOT NULL DEFAULT '{}',
  chat_messages TEXT NOT NULL DEFAULT '[]',
  specs TEXT NOT NULL DEFAULT '{}',
  mind_map_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add mind_map_json if table already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'mind_map_json') THEN
    ALTER TABLE public.projects ADD COLUMN mind_map_json TEXT NOT NULL DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_select_own" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "projects_insert_own" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_update_own" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "projects_delete_own" ON public.projects FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "projects_service_all" ON public.projects FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Chats (per-project thread; messages_json for compatibility)
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add messages_json if table already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chats')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chats' AND column_name = 'messages_json') THEN
    ALTER TABLE public.chats ADD COLUMN messages_json TEXT NOT NULL DEFAULT '[]';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chats_user ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_project ON public.chats(project_id);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chats_select_own" ON public.chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chats_insert_own" ON public.chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chats_update_own" ON public.chats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "chats_delete_own" ON public.chats FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "chats_service_all" ON public.chats FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Mind maps (per project; JSON blob)
CREATE TABLE IF NOT EXISTS public.mind_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mind_maps_user ON public.mind_maps(user_id);
CREATE INDEX IF NOT EXISTS idx_mind_maps_project ON public.mind_maps(project_id);

ALTER TABLE public.mind_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mind_maps_select_own" ON public.mind_maps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mind_maps_insert_own" ON public.mind_maps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mind_maps_update_own" ON public.mind_maps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "mind_maps_delete_own" ON public.mind_maps FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "mind_maps_service_all" ON public.mind_maps FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger: sync updated_at on users
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS chats_updated_at ON public.chats;
CREATE TRIGGER chats_updated_at BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS mind_maps_updated_at ON public.mind_maps;
CREATE TRIGGER mind_maps_updated_at BEFORE UPDATE ON public.mind_maps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
