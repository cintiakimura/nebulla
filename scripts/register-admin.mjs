/**
 * Register an email or GitHub user as admin (and paid) in Supabase.
 * Requires: SUPABASE_URL and SUPABASE_SECRET_KEY in .env
 *
 * Run from project root:
 *   node scripts/register-admin.mjs <email>
 *   node scripts/register-admin.mjs github:<username>
 *
 * Example:
 *   node scripts/register-admin.mjs cintiakimura20@gmail.com
 *   node scripts/register-admin.mjs github:cintiakimura
 *
 * For GitHub: the user must have signed in with GitHub at least once so Supabase has their identity.
 * In Supabase (SQL Editor), run once to add admin column if needed:
 *   ALTER TABLE public.users ADD COLUMN IF NOT EXISTS admin boolean DEFAULT false;
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const raw = process.argv[2]?.trim();
if (!raw) {
  console.error("Usage: node scripts/register-admin.mjs <email> | github:<username>");
  process.exit(1);
}

const githubMatch = /^github:(.+)$/i.exec(raw);
const byGitHub = !!githubMatch;
const email = byGitHub ? null : raw.toLowerCase();
const githubUsername = byGitHub ? githubMatch[1].toLowerCase() : null;

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey || url === "PLACEHOLDER" || secretKey === "PLACEHOLDER") {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (use Service Role key from Supabase → Settings → API).");
  process.exit(1);
}

const supabase = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

function userMatchesGitHub(u, username) {
  const un = username.toLowerCase();
  const meta = u?.user_metadata || {};
  if ((meta.user_name || "").toLowerCase() === un) return true;
  if ((meta.preferred_username || "").toLowerCase() === un) return true;
  const identities = u?.identities || [];
  for (const id of identities) {
    const data = id?.identity_data || {};
    if ((data.user_name || "").toLowerCase() === un) return true;
    if ((data.preferred_username || "").toLowerCase() === un) return true;
  }
  return false;
}

async function main() {
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error("List users error:", listErr.message);
    process.exit(1);
  }
  const users = listData?.users || [];
  let authUser = null;

  if (byGitHub) {
    authUser = users.find((u) => userMatchesGitHub(u, githubUsername));
    if (!authUser) {
      console.error("No Supabase Auth user found with GitHub username:", githubUsername);
      console.error("They must sign in with GitHub once (Supabase → Authentication → Providers → GitHub) so their account is linked.");
      process.exit(1);
    }
  } else {
    authUser = users.find((u) => u.email?.toLowerCase() === email);
    if (!authUser) {
      const tempPassword = crypto.randomUUID().replace(/-/g, "") + "Aa1!";
      const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (createErr) {
        console.error("Create user error:", createErr.message);
        process.exit(1);
      }
      authUser = createData?.user;
      console.log("Created auth user for", email, "— they should use “Forgot password” to set a password.");
    }
  }

  const userId = authUser?.id;
  if (!userId) {
    console.error("No user id");
    process.exit(1);
  }

  const { error: upsertErr } = await supabase
    .from("users")
    .upsert(
      { id: userId, paid: true, plan: "king_pro", admin: true },
      { onConflict: "id" }
    );

  if (upsertErr) {
    if (upsertErr.message?.includes("admin") || upsertErr.code === "42703") {
      console.error("Upsert failed: add admin column in Supabase SQL Editor:");
      console.error("  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS admin boolean DEFAULT false;");
      console.error("Then run this script again.");
    } else {
      console.error("Upsert error:", upsertErr.message);
    }
    process.exit(1);
  }

  const label = byGitHub ? `GitHub @${githubUsername}` : email;
  console.log("Done. Registered", label, "as admin (paid, king_pro).");
}

main();
