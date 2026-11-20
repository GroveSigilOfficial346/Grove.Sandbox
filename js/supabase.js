if (!window.supabase) {
  throw new Error("Supabase library did not load.");
}

if (!window.GROVE_CONFIG) {
  throw new Error("Grove configuration did not load.");
}

window.supabaseClient = window.supabase.createClient(
  window.GROVE_CONFIG.SUPABASE_URL,
  window.GROVE_CONFIG.SUPABASE_KEY
);

console.log("Grove Supabase client initialized.");
