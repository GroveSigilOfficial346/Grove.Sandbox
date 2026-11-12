import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const ALLOWED_THEMES = new Set([
    "midnight-galaxy",
    "velvet-noir",
    "obsidian",
    "rose-chrome",
    "gothic-violet",
    "dark-romance",
    "blood-moon",
    "silver-key",
    "enchanted-lock",
    "celestial-velvet",
    "neon-noir"
  ]);

  async function initialize() {
    if (!document.querySelector(".messages-app")) return;

    try {
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!auth.user) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (profile?.account_type !== "adult") return;

      const { data: access, error: accessError } = await supabase
        .from("grove_adult_access")
        .select("verification_status")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (accessError) throw accessError;
      if (access?.verification_status !== "verified") return;

      const { data: preferences, error: preferencesError } =
        await supabase
          .from("grove_adult_preferences")
          .select("theme_id")
          .eq("user_id", auth.user.id)
          .maybeSingle();

      if (preferencesError) throw preferencesError;

      const theme = preferences?.theme_id;

      if (!ALLOWED_THEMES.has(theme)) return;

      document.body.dataset.groveAdultTheme = theme;

    } catch (error) {
      console.warn("Grove adult chat theme was not applied:", error);
    }
  }

  initialize();
})();
