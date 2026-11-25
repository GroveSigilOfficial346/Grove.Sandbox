(() => {
  const form = document.getElementById("signup-form");
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
    button.textContent = "CREATING ACCOUNT...";
    status.textContent = "";

    try {
      const supabase = await window.groveSupabaseReady;
      const username = document.getElementById("username").value.trim().toLowerCase();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        throw new Error("Username must be 3–24 characters: letters, numbers, underscores.");
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
          emailRedirectTo: window.location.origin + "/profile.html"
        }
      });

      if (error) throw error;

      if (data.session) {
        window.location.href = "profile.html";
        return;
      }

      status.textContent =
        "Account created. Check your email to confirm your address, then sign in.";
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "CREATE ACCOUNT";
    }
  });
})();
