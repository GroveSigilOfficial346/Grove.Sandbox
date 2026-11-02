import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

// Keep your existing complete anon key here.
// Do not use a service-role or secret key.
const SUPABASE_ANON_KEY = "PASTE_YOUR_EXISTING_ANON_KEY_HERE";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);

// Temporary compatibility for older Grove scripts.
window.groveClient = supabase;

console.info("Grove.Sandbox connected.");
