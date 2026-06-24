import { createClient } from '@supabase/supabase-js';

// Retrieve our hidden environment secrets from the system vault
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Throw a clear error if we forgot to set up our .env.local file
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables in .env.local');
}

// Initialize and export a single connection instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

