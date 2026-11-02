/* =========================================
   GROVE — SUPABASE CONNECTION
   File: js/supabase.js
========================================= */

import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  "https://wmkujovlsfvahycjcmkj.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indta3Vqb3Zsc2Z2YWh5Y2pjbWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTg2MDEsImV4cCI6MjEwODE3NDYwMX0.YgR5GG_RJWgWjczh3J4TKoTTpT4ZzRuomPsBmuakY8k";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

window.supabaseClient = supabase;

console.log("Grove: Connected to Supabase.");
