-- Run this in Supabase → SQL Editor (once) so register-admin script can set admin flag.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS admin boolean DEFAULT false;
