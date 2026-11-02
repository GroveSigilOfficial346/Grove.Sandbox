async function initialize() {
  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    currentUser = authData.user || null;

    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const username = params.get("username");

    if (!id && !username && !currentUser) {
      setStatus("Sign in to view your profile.", true);
      return;
    }

    isOwner = Boolean(
      currentUser &&
      (!id && !username || id === currentUser.id)
    );

    if (isOwner) {
      // Owners can load their own complete profile.
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error) throw error;

      profile = data;
    } else {
      // First load only fields intended for public profile display.
      const directoryQuery = supabase
        .from("profile_directory")
        .select(
          "id,username,display_name,bio,avatar_url,cover_url,is_private"
        );

      const { data: directoryProfile, error: directoryError } =
        await (id
          ? directoryQuery.eq("id", id)
          : directoryQuery.eq("username", username)
        ).maybeSingle();

      if (directoryError) throw directoryError;

      if (!directoryProfile) {
        setStatus("Profile not found.", true);
        return;
      }

      // Establish the profile's public identity first.
      profile = directoryProfile;

      // Check the viewer's relationship BEFORE requesting private fields.
      await loadRelationship();

      // Only request the full profile when access is permitted.
      if (canViewPrivateContent) {
        const { data: fullProfile, error: fullProfileError } =
          await supabase
            .from("profiles")
            .select("*")
            .eq("id", directoryProfile.id)
            .maybeSingle();

        if (fullProfileError) {
          // Keep the public directory profile usable if optional
          // extended profile data cannot be retrieved.
          console.warn(
            "Could not load extended profile data:",
            fullProfileError.message
          );
        } else if (fullProfile) {
          profile = fullProfile;
        }
      }
    }

    if (!profile) {
      setStatus("Profile not found.", true);
      return;
    }

    // Own profiles already have full access. For other profiles,
    // the relationship was checked above.
    if (isOwner) {
      await loadRelationship();
    }

    renderProfile();
    updateButtons();

    $("#follow-button")?.addEventListener(
      "click",
      followAction
    );

    $("#edit-profile-button")?.addEventListener(
      "click",
      () => {
        location.href = "/edit-profile.html";
      }
    );

    $("#message-button")?.addEventListener(
      "click",
      () => {
        location.href =
          `/messages.html?user=${encodeURIComponent(profile.id)}`;
      }
    );

    connectUploads();

    await Promise.all([
      loadPreferences(),
      loadMusic(),
      loadCounts(),
      loadPosts(),
      loadIncomingRequests()
    ]);

    setStatus("");
  } catch (error) {
    console.error("Profile load failed:", error);

    setStatus(
      error.message || "Unable to load profile.",
      true
    );
  }
}
