import { createClient } from '@supabase/supabase-js';

// NOTE: In a real production app, these should be in a .env file
// Since we are running locally/vite, we can use import.meta.env or just hardcode for this demo
// Replace these with your actual Supabase URL and Anon Key
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isConfigured = SUPABASE_URL.startsWith('http');

if (!isConfigured) {
    console.warn("Supabase not configured! Using Mock Client. Please set VITE_SUPABASE_URL in .env");
}

// Mock Client to prevent crashes if credentials missing
const mockClient = {
    from: () => ({
        select: () => ({ eq: () => ({ gt: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }), order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
        insert: () => Promise.resolve({ error: null }),
        update: () => Promise.resolve({ error: null })
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null })
    }
} as any;

export const supabase = isConfigured
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : mockClient;

export const getCurrentUser = async () => {
    if (!isConfigured) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};
