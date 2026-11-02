(() => {
  "use strict";

  const SUPABASE_URL =
    "https://fpkrvgcpbnrusbfmhinj.supabase.co";

  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa3J2Z2NwYm5ydXNiZm1oaW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTc2OTYsImV4cCI6MjEwODA5MzY5Nn0.3CI1pHaEnpcQjnweA_g4Cmsscqp3eltMXWbPj2owHfo";

  if (!window.supabase) {
    console.error(
      "Grove.Sandbox: Supabase library was not loaded."
    );

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

  console.info(
    "Grove.Sandbox database connection initialized."
  );
})();
```
