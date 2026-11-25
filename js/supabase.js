import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const config = window.GROVE_CONFIG;

if (!config || !config.supabaseUrl || !config.supabaseKey) {
  throw new Error("Grove configuration is missing.");
}

const supabase = createClient(
  config.supabaseUrl,
  config.supabaseKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);

window.groveSupabase = supabase;
window.GROVE_CONNECTION_STATUS = "client-ready";

supabase.auth.onAuthStateChange((event, session) => {
  window.GROVE_AUTHENTICATED = Boolean(session);
  window.GROVE_AUTH_EVENT = event;
});
