(() => {
  "use strict";

  const SUPABASE_URL =
    "https://fpkrvgcpbnrusbfmhinj.supabase.co";

  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa3J2Z2NwYm5ydXNiZm1oaW5qIiwicm9sZSI6ImFub24iLCJpYXQiMTc5MjUxNzY5NiwibmJmIjoxNzkyNTE3Njk2LCJleHAiOjIxMDgwOTM2OTZ9.3CI1pHaEnpcQjnweA_g4Cmsscqp3eltMXWbPj2owHfo";

  if (!window.supabase) {
    console.error("Grove: Supabase library did not load.");
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

  console.info("Grove.Sandbox connected.");
})();
