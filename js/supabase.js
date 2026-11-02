/* =========================================
   GROVE — SUPABASE CONNECTION
   File: js/supabase.js
========================================= */

import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

const SUPABASE_ANON_KEY =
  "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

if (
  !SUPABASE_ANON_KEY ||
  SUPABASE_ANON_KEY === "PASTE_YOUR_SUPABASE_ANON_KEY_HERE"
) {
  throw new Error("Grove: Supabase public key is missing.");
}

window.supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("Grove: Supabase connected.");
