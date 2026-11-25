/* GROVE SANDBOX — Protected profile access */
(async () => {
  const page = window.location.pathname.split("/").pop();

  try {
    const supabase = await window.groveSupabaseReady;
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (!data.user) {
      window.location.replace(
        "login.html?next=" + encodeURIComponent(page || "profile.html")
      );
      return;
    }

    window.groveCurrentUser = data.user;

    window.dispatchEvent(
      new CustomEvent("grove:authenticated", {
        detail: { user: data.user }
      })
    );
  } catch (error) {
    const main = document.querySelector("main");
    if (main) {
      main.textContent = "Session error: " + error.message;
    }
  }
})();
