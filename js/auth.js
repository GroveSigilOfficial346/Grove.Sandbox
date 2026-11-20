window.GROVE_AUTH = {
  async checkSession() {
    if (!window.supabaseClient) {
      console.error("Grove: Supabase is not connected.");
      return null;
    }

    const { data, error } =
      await window.supabaseClient.auth.getSession();

    if (error) {
      console.error("Grove session check failed:", error.message);
      return null;
    }

    return data.session;
  }
};

console.log("Grove authentication module loaded.");
