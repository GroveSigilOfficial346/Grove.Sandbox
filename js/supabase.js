import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa3J2Z2NwYm5ydXNiZm1oaW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTc2OTYsImV4cCI6MjEwODA5MzY5Nn0.3CI1pHaEnpcQjnweA_g4Cmsscqp3eltMXWbPj2owHfo";

export const supabase = createClient(
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

// Temporary compatibility for older scripts.
window.groveClient = supabase;

console.info("Grove.Sandbox connected.");
