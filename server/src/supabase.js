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

export const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || (process.env.NODE_ENV === 'production' ? '' : 'stan-admin-2026');
if (!process.env.ADMIN_SECRET_KEY) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[CRITICAL] ADMIN_SECRET_KEY is not set in production! Admin endpoints are disabled.');
  } else {
    console.warn('[SECURITY] ADMIN_SECRET_KEY not set. Using development default: stan-admin-2026');
  }
}

export const PORT = Number(process.env.PORT || 8787);

const configuredOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const ALLOWED_ORIGIN = configuredOrigins.length > 0
  ? configuredOrigins
  : [
      'http://localhost:5173',
      'http://localhost:4173',
      'https://studio.mxsourav.dev',
      'https://stan-studio.vercel.app',
    ];
