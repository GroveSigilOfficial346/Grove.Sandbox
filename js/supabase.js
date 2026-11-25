/* GROVE SANDBOX — Supabase connection */
(() => {
  const CONFIG = {
    url: "https://fpkrvgcpbnrusbfmhinj.supabase.co",
    key: "PASTE_SANDBOX_PUBLIC_ANON_KEY_HERE"
  };

  window.groveSupabase = null;

  window.groveSupabaseReady = new Promise((resolve, reject) => {
    if (!CONFIG.key || CONFIG.key.includes("PASTE_")) {
      reject(new Error("Add the Sandbox public key in js/supabase.js."));
      return;
    }

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
