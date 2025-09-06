import { createClient } from '@supabase/supabase-js';

// Safe access to process.env with fallback
const safeProcessEnv = (typeof process !== 'undefined' && process.env) ? process.env : {} as Record<string, string | undefined>;

const url = safeProcessEnv.NEXT_PUBLIC_SUPABASE_URL || safeProcessEnv.REACT_APP_SUPABASE_URL;
const anon = safeProcessEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || safeProcessEnv.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = url && anon ? createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true }
}) : null;


