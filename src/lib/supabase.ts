// src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireEnv } from './env';

// Injected at build time from .env (see .env.example). Never commit real values.
const SUPABASE_URL = requireEnv(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env.EXPO_PUBLIC_SUPABASE_URL
);
const SUPABASE_ANON_KEY = requireEnv(
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Use AsyncStorage to persist the session on RN
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    storageKey: 'sb-calorie-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN doesn’t use URL-based redirects
  },
});

export default supabase;
export { supabase };
