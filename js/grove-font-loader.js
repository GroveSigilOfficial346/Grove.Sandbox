import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const ALLOWED = new Set([
    "modern",
    "cinzel",
    "gothic",
    "blackletter",
    "serif",
    "mono"
  ]);

  async function loadProfileFont() {
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedId = params.get("id");
      const requestedUsername = params.get("username");

      let query = supabase
        .from("profile_directory")
        .select("profile_font");

      if (requestedId) {
        query = query.eq("id", requestedId);
      } else if (requestedUsername) {
        query = query.eq("username", requestedUsername.toLowerCase());
      } else {
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;
        if (!auth.user) return;

        query = query.eq("id", auth.user.id);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      const font = data?.profile_font || "modern";

      document.body.dataset.groveFont =
        ALLOWED.has(font) ? font : "modern";

    } catch (error) {
      console.warn("Grove profile font could not load:", error);
      document.body.dataset.groveFont = "modern";
    }
  }

  loadProfileFont();
})();
