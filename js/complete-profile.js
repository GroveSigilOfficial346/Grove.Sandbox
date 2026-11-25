/* GROVE SANDBOX — Load edit-profile form */
(async () => {
  const form = document.getElementById("edit-profile-form");
  if (!form) return;

  const status = document.getElementById("edit-status");

  try {
    const supabase = await window.groveSupabaseReady;
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    if (!auth.user) {
      window.location.replace("login.html");
      return;
    }

    window.groveCurrentUser = auth.user;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("username, display_name, bio, avatar_url")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) throw error;

    document.getElementById("display-name").value =
      profile?.display_name || "";

    document.getElementById("username").value =
      profile?.username || auth.user.user_metadata?.username || "";

    document.getElementById("bio").value =
      profile?.bio || "";

    document.getElementById("avatar-url").value =
      profile?.avatar_url || "";

    if (status) {
      status.textContent =
        "Cover image saving will be enabled after the database field is verified.";
    }
  } catch (error) {
    if (status) status.textContent = error.message;
  }
})();
