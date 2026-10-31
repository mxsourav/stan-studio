import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[server] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — set them in .env');
}

// Placeholder credentials keep the module importable (and /api/health alive)
// in environments where the secrets are not wired yet; every DB-backed
// request simply fails until the real values are set.
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const supabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

export const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'stan-admin-2026';
export const PORT = Number(process.env.PORT || 8787);
export const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
