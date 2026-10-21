/**
 * STΔN Studio — Official Supabase Database Client Utility
 * 
 * Configured with:
 * - Supabase URL: https://imeravcrrnfmigwzqjzl.supabase.co
 * - Publishable Key: sb_publishable_kz9AY9IH3bXWCH_bRjxS0w_0cKw0A1B
 * 
 * Supports browser, Vite, Next.js, and Node.js environments.
 */

import { createClient } from '@supabase/supabase-js';

// Fallback to configured project constants if environment variables are not injected
const DEFAULT_SUPABASE_URL = 'https://imeravcrrnfmigwzqjzl.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_kz9AY9IH3bXWCH_bRjxS0w_0cKw0A1B';

/**
 * Resolve environment variables safely across Node, Next.js, Vite, and browser runtimes.
 */
function getEnv(key) {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    return undefined;
}

export const supabaseUrl = 
    getEnv('NEXT_PUBLIC_SUPABASE_URL') ||
    getEnv('VITE_SUPABASE_URL') ||
    getEnv('SUPABASE_URL') ||
    DEFAULT_SUPABASE_URL;

export const supabaseAnonKey = 
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    getEnv('VITE_SUPABASE_ANON_KEY') ||
    getEnv('SUPABASE_ANON_KEY') ||
    DEFAULT_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[STΔN Studio / Supabase] Missing Supabase connection credentials. Check .env.local.');
}

/**
 * Standard Supabase client instance for client-side queries, authentication, and realtime subscriptions.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

/**
 * Helper to initialize an elevated administrative client with the service role secret key.
 * Only use in secure server-side environments (Node.js APIs, serverless functions).
 */
export function getSupabaseAdmin() {
    const serviceRoleKey = 
        getEnv('SUPABASE_SERVICE_ROLE_KEY') || 
        getEnv('SUPABASE_SECRET_KEY') ||
        'sb_secret_KY9Kpel_N13ssMqf84cC_w_MnuHCydW';

    if (!serviceRoleKey) {
        throw new Error('[STΔN Studio / Supabase Admin] Secret service role key is not configured.');
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}

export default supabase;
