-- Run in Supabase SQL Editor. Adds profiles.first_login_done and projects.plan / code_versions for full Kyn flow.

-- Profiles: first_login_done for onboarding modal
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_login_done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_service_all" ON public.profiles FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Projects: plan (structured wizard answers), code_versions (history), deployment_status, live_url
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'plan') THEN
    ALTER TABLE public.projects ADD COLUMN plan JSONB NOT NULL DEFAULT '{}';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'code_versions') THEN
    ALTER TABLE public.projects ADD COLUMN code_versions JSONB NOT NULL DEFAULT '[]';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'deployment_status') THEN
    ALTER TABLE public.projects ADD COLUMN deployment_status TEXT NOT NULL DEFAULT 'none';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'live_url') THEN
    ALTER TABLE public.projects ADD COLUMN live_url TEXT;
  END IF;
END $$;

-- Optional: if your DB has set_updated_at(), uncomment:
-- DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
-- CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
