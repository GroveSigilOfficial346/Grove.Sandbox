(async function () {
  try {
    if (!window.supabase) {
      throw new Error("Supabase library did not load.");
    }

    if (!window.GROVE_CONFIG) {
      throw new Error("Grove config did not load.");
    }

    if (!window.supabaseClient) {
      throw new Error("Supabase client did not initialize.");
    }

    const { error } = await window.supabaseClient
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) {
      throw error;
    }

    console.log("Grove database connection verified.");
  } catch (error) {
    window.alert("Grove connection error: " + error.message);
  }
})();
