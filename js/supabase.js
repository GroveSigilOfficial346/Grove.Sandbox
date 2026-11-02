(() => {
  "use strict";

  const SUPABASE_URL =
    "https://fpkrvgcpbnrusbfmhinj.supabase.co";

  const SUPABASE_ANON_KEY =
    "PASTE_THE_SANDBOX_ANON_KEY_YOU_JUST_SENT_HERE";

  if (!window.supabase) {
    console.error("Grove: Supabase library was not loaded.");
    window.groveClient = null;
    return;
  }

  if (window.groveClient) return;

  window.groveClient = window.supabase.createClient(
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

  console.info("Grove.Sandbox connection initialized.");
})();
