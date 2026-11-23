(function () {
  const form = document.querySelector("[data-auth-form]");
  if (!form) return;

  const status = document.querySelector("[data-auth-status]");
  const submit = form.querySelector('button[type="submit"]');
  const page = form.dataset.authForm;

  function showStatus(message, type) {
    status.textContent = message;
    status.dataset.type = type || "info";
  }

  function setBusy(busy) {
    submit.disabled = busy;
    submit.textContent = busy
      ? "PLEASE WAIT..."
      : page === "signup"
        ? "CREATE ACCOUNT"
        : "LOG IN";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    showStatus("", "info");
    setBusy(true);

    try {
      const values = new FormData(form);

      if (page === "signup") {
        const result = await window.GROVE_AUTH.signUp({
          email: values.get("email"),
          password: values.get("password"),
          username: values.get("username"),
          displayName: values.get("display_name")
        });

        if (result.session) {
          showStatus(
            "Account created. Your Grove profile is ready.",
            "success"
          );
          window.location.href = "index.html";
        } else {
          showStatus(
            "Account created. Check your email to confirm your address, then log in.",
            "success"
          );
          form.reset();
        }
      } else {
        await window.GROVE_AUTH.signIn({
          email: values.get("email"),
          password: values.get("password")
        });

        window.location.href = "index.html";
      }
    } catch (error) {
      showStatus(
        error.message || "Authentication failed. Please try again.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  });

  window.GROVE_AUTH.checkSession()
    .then(function (session) {
      if (session && page === "login") {
        showStatus("You are already logged in.", "success");
      }
    })
    .catch(function (error) {
      showStatus(error.message, "error");
    });
})();
