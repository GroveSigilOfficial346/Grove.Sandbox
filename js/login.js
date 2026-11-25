(() => {
  const form = document.getElementById("login-form");
  if (!form) return;

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.cssText = "margin-top:16px;color:#aaa;font-size:13px;";
  form.appendChild(status);

  const button = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "SIGNING IN...";
    status.textContent = "";

    try {
      const supabase = await window.groveSupabaseReady;

      const { error } = await supabase.auth.signInWithPassword({
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value
      });

      if (error) throw error;
      window.location.href = "profile.html";
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
      button.textContent = "SIGN IN";
    }
  });
})();
