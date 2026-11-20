(async function () {
  const status = document.createElement("div");

  status.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 0;
    width: 100%;
    text-align: center;
    color: #888;
    font: 13px Arial, sans-serif;
  `;

  status.textContent = "Checking Grove connection...";
  document.body.appendChild(status);

  try {
    if (!window.supabaseClient) {
      throw new Error("Supabase client not initialized.");
    }

    const { error } = await window.supabaseClient
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) throw error;

    status.textContent = "Grove database connected.";
  } catch (error) {
    status.textContent = "Grove connection failed.";
    console.error("Grove test:", error.message);
  }
})();
