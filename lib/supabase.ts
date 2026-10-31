/**
 * STΔN Studio — Supabase TypeScript Client Utility
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://imeravcrrnfmigwzqjzl.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'REDACTED-SET-VIA-ENV';

function getEnv(key: string): string | undefined {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    return undefined;
}

export const supabaseUrl: string = 
    getEnv('NEXT_PUBLIC_SUPABASE_URL') ||
    getEnv('VITE_SUPABASE_URL') ||
    getEnv('SUPABASE_URL') ||
    DEFAULT_SUPABASE_URL;

export const supabaseAnonKey: string = 
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    getEnv('VITE_SUPABASE_ANON_KEY') ||
    getEnv('SUPABASE_ANON_KEY') ||
    DEFAULT_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

export function getSupabaseAdmin(): SupabaseClient {
    const serviceRoleKey = 
        getEnv('SUPABASE_SERVICE_ROLE_KEY') || 
        getEnv('SUPABASE_SECRET_KEY') ||
        'REDACTED-SET-VIA-ENV';

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
