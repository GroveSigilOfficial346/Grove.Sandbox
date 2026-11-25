/* GROVE SANDBOX — Load member profile */
(async () => {
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value || "";
  };

  try {
    const supabase = await window.groveSupabaseReady;
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;
    if (!auth.user) return;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("username, display_name, bio, avatar_url")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) throw error;

    const metadata = auth.user.user_metadata || {};

    setText(
      "display-name",
      profile?.display_name || metadata.display_name || "Grove Member"
    );

    setText(
      "username",
      "@" + (profile?.username || metadata.username || "member")
    );

    setText(
      "profile-bio",
      profile?.bio || "Welcome to Grove."
    );

    const avatar = document.getElementById("profile-avatar");

    if (avatar && profile?.avatar_url) {
      avatar.src = profile.avatar_url;
    }
  } catch (error) {
    console.error("Grove profile error:", error);
    setText("profile-bio", "Unable to load profile. Please try again.");
  }
})();
