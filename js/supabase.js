import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const SUPABASE_URL = "https://sbeiqnmtwbhesmocqmuk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Y3v6vOl71LIJumZ_m7ANFA_fy1SrYJv";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

export const OWNER_EMAIL = "bleedvow@gmail.com";
