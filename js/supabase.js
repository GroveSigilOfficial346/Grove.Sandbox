/* =========================================
   GROVE — SUPABASE CONNECTION
   File: js/supabase.js
========================================= */

import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

window.supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("Grove: Supabase connected.");
