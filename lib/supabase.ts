import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkPublicKey } from './supabaseKey';

// The only Supabase client of the app. Without VITE_SUPABASE_URL it is null
// and the app runs the demo mode with fictitious data.
//
// The publishable key (sb_publishable_...) is public by design: every table
// has Row Level Security and the database decides what each user may do.
// Secret keys live only in the Edge Functions.

// TODO: trocar por SupabaseClient<Database> (lib/database.types.ts, gerado por
// `supabase gen types typescript --local`) e apagar os tipos de linha escritos
// à mão em services/types.ts.
export type AppSupabaseClient = SupabaseClient;

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
const configured = url !== '' && publishableKey !== '';

// A secret or service key in the public variable would ship to every visitor
// and bypass RLS: refuse it and stay in the demo mode.
const keyRefused = configured && checkPublicKey(publishableKey) === 'refused';
if (keyRefused) {
  console.error(
    'VITE_SUPABASE_PUBLISHABLE_KEY recusada: use a chave publicável (sb_publishable_...) ou a anon key. ' +
      'Chaves secretas nunca vão para o app. O app segue no modo demonstração.',
  );
}

export const backendEnabled: boolean = configured && !keyRefused;

export const supabase: AppSupabaseClient | null = backendEnabled
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
