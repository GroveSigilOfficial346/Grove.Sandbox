/* GROVE SANDBOX — Supabase connection */
(() => {
  const CONFIG = {
    url: "https://sbeiqnmtwbhesmocqmuk.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZWlxbm10d2JoZXNtb2NxbXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMDI0NzEsImV4cCI6MjExMDc3ODQ3MX0.iC8bLQjqadb_dgowrPBZ6Ow_m0QzSgFdyA-13yN6uZM"
  };

  window.groveSupabase = null;

  window.groveSupabaseReady = new Promise((resolve, reject) => {
    const start = () => {
      if (!window.supabase?.createClient) {
        reject(new Error("Supabase SDK failed to load."));
        return;
      }

      window.groveSupabase = window.supabase.createClient(
        CONFIG.url,
        CONFIG.key,
        {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
          }
        }
      );

      resolve(window.groveSupabase);
    };

    if (window.supabase?.createClient) return start();

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = start;
    script.onerror = () => reject(new Error("Could not load Supabase SDK."));
    document.head.appendChild(script);
  });
})();
