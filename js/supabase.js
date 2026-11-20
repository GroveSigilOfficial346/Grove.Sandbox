const script = document.createElement("script");

script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

script.onload = () => {
  window.supabaseClient = window.supabase.createClient(
    window.GROVE_CONFIG.SUPABASE_URL,
    window.GROVE_CONFIG.SUPABASE_KEY
  );

  console.log("Grove Supabase connected.");
};

document.head.appendChild(script);
