(() => {
  "use strict";

  const SUPABASE_URL =
    "https://fpkrvgcpbnrusbfmhinj.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  if (!window.supabase) {
    console.error(
      "Grove: Supabase library was not loaded."
    );
    return;
  }

  if (window.groveClient) {
    return;
  }

  window.groveClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  );

  console.info("Grove database connection initialized.");
})();
