/* GROVE SANDBOX — Save profile changes */
(() => {
  const form = document.getElementById("edit-profile-form");
  if (!form) return;

  const status = document.getElementById("edit-status");
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    button.disabled = true;
    button.textContent = "SAVING...";
    status.textContent = "";

    try {
      const supabase = await window.groveSupabaseReady;
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!auth.user) throw new Error("Please sign in again.");

      const username = document
        .getElementById("username")
        .value.trim()
        .toLowerCase();

      const displayName = document
        .getElementById("display-name")
        .value.trim();

      const bio = document
        .getElementById("bio")
        .value.trim();

      const avatarUrl = document
        .getElementById("avatar-url")
        .value.trim();

      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        throw new Error(
          "Username must be 3–24 characters using letters, numbers, or underscores."
        );
      }

      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: auth.user.id,
          username,
          display_name: displayName,
          bio,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "id"
        });

      if (error) throw error;

      status.textContent = "Profile saved successfully.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "SAVE CHANGES";
    }
  });
})();
