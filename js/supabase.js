console.log("Grove Supabase client loading");

const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

if (!window.supabase?.createClient) {
  console.error("Grove: Supabase JS library did not load.");
  window.groveClient = null;
} else {
  window.groveClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  console.log("Grove Supabase client ready.");
}
