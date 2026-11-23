window.GROVE_AUTH = {
  async checkSession() {
    if (!window.supabaseClient) {
      throw new Error("Supabase is not connected.");
    }

    const { data, error } =
      await window.supabaseClient.auth.getSession();

    if (error) throw error;
    return data.session;
  },

  async signUp({ email, password, username, displayName }) {
    if (!window.supabaseClient) {
      throw new Error("Supabase is not connected.");
    }

    const cleanUsername = String(username || "").trim().toLowerCase();
    const cleanDisplayName = String(displayName || "").trim();

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
      throw new Error(
        "Username must be 3–24 characters using letters, numbers, or underscores."
      );
    }

    if (!email || !password) {
      throw new Error("Enter your email and password.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const { data, error } =
      await window.supabaseClient.auth.signUp({
        email: String(email).trim(),
        password,
        options: {
          data: {
            username: cleanUsername,
            display_name: cleanDisplayName
          },
          emailRedirectTo:
            window.location.origin + "/login.html"
        }
      });

    if (error) throw error;
    return data;
  },

  async signIn({ email, password }) {
    if (!window.supabaseClient) {
      throw new Error("Supabase is not connected.");
    }

    const { data, error } =
      await window.supabaseClient.auth.signInWithPassword({
        email: String(email || "").trim(),
        password: password || ""
      });

    if (error) throw error;
    return data;
  },

  async signOut() {
    if (!window.supabaseClient) {
      throw new Error("Supabase is not connected.");
    }

    const { error } =
      await window.supabaseClient.auth.signOut();

    if (error) throw error;
  }
};

console.log("Grove authentication module loaded.");
