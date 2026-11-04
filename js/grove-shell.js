export function installGroveShell(supabase) {
  "use strict";

  const REMEMBER_KEY = "grove:remember-session";

  const style = document.createElement("style");
  style.id = "grove-shell-styles";

  style.textContent = `
    body {
      background-color: #050019 !important;
      background-image:
        radial-gradient(
          circle at 12% 18%,
          rgba(255,255,255,.75) 0 1px,
          transparent 1.7px
        ),
        radial-gradient(
          circle at 78% 24%,
          rgba(5,201,244,.75) 0 1px,
          transparent 1.8px
        ),
        radial-gradient(
          circle at 42% 73%,
          rgba(255,255,255,.65) 0 1px,
          transparent 1.8px
        ),
        radial-gradient(
          circle at 88% 82%,
          rgba(235,54,237,.7) 0 1px,
          transparent 1.8px
        ),
        radial-gradient(
          ellipse at 15% 15%,
          rgba(133,30,255,.28),
          transparent 43%
        ),
        radial-gradient(
          ellipse at 85% 25%,
          rgba(235,54,237,.16),
          transparent 40%
        ),
        radial-gradient(
          ellipse at 50% 100%,
          rgba(5,201,244,.10),
          transparent 48%
        ) !important;
      background-attachment: fixed !important;
      background-size:
        180px 180px,
        230px 230px,
        260px 260px,
        310px 310px,
        auto,
        auto,
        auto !important;
    }

    .grove-account-controls {
      position: relative;
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      margin-left: 8px;
      z-index: 1000;
    }

    .grove-account-controls summary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 8px 13px;
      border: 1px solid rgba(133,30,255,.55);
      border-radius: 9px;
      background: rgba(133,30,255,.20);
      color: #f7f5ff;
      font-size: .82rem;
      font-weight: 700;
      cursor: pointer;
      list-style: none;
      white-space: nowrap;
    }

    .grove-account-controls summary::-webkit-details-marker {
      display: none;
    }

    .grove-account-controls summary:hover {
      border-color: #05c9f4;
      background: rgba(133,30,255,.34);
    }

    .grove-account-menu {
      position: absolute;
      top: calc(100% + 9px);
      right: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 205px;
      padding: 8px;
      border: 1px solid rgba(133,30,255,.45);
      border-radius: 12px;
      background: rgba(12,7,31,.98);
      box-shadow: 0 14px 42px rgba(0,0,0,.45);
      backdrop-filter: blur(18px);
    }

    .grove-account-menu a,
    .grove-account-menu button {
      display: block;
      width: 100%;
      padding: 10px 11px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #f7f5ff;
      font: inherit;
      font-size: .84rem;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }

    .grove-account-menu a:hover,
    .grove-account-menu button:hover {
      background: rgba(133,30,255,.25);
      color: #05c9f4;
    }

    .grove-account-menu .grove-logout {
      color: #ff9b9b;
    }

    .grove-account-menu .grove-menu-divider {
      height: 1px;
      margin: 4px 2px;
      background: rgba(190,155,255,.18);
    }

    .grove-shell-toast {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 99999;
      max-width: min(340px, calc(100vw - 36px));
      padding: 12px 16px;
      border: 1px solid rgba(5,201,244,.4);
      border-radius: 10px;
      background: rgba(12,7,31,.97);
      color: #f7f5ff;
      font-size: .86rem;
      box-shadow: 0 10px 35px rgba(0,0,0,.35);
    }

    @media (max-width: 600px) {
      .grove-account-controls summary {
        min-height: 35px;
        padding: 7px 9px;
        font-size: .74rem;
      }

      .grove-account-menu {
        width: 190px;
      }
    }
  `;

  document.head.append(style);

  function toast(message) {
    let node = document.querySelector(".grove-shell-toast");

    if (!node) {
      node = document.createElement("div");
      node.className = "grove-shell-toast";
      node.setAttribute("role", "status");
      document.body.append(node);
    }

    node.textContent = message;

    window.setTimeout(() => {
      node.remove();
    }, 3200);
  }

  async function applySavedBackground(user) {
    let backgroundUrl = null;

    if (user) {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("background_mode,custom_background_url")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        const path = data?.custom_background_url;

        if (
          data?.background_mode === "custom" &&
          typeof path === "string" &&
          path.startsWith(user.id + "/profile-background-")
        ) {
          const { data: imageData } = supabase.storage
            .from("grove-media")
            .getPublicUrl(path);

          backgroundUrl = imageData?.publicUrl || null;
        }
      } catch (error) {
        console.warn("Grove background preference unavailable:", error);
      }
    }

    if (backgroundUrl) {
      const safeUrl = JSON.stringify(backgroundUrl);

      style.textContent += `
        body {
          background-image:
            linear-gradient(
              rgba(5,0,25,.48),
              rgba(5,0,25,.68)
            ),
            url(${safeUrl}) !important;
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
          background-attachment: fixed !important;
        }
      `;
    }
  }

  function createMenuItem(label, action, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;

    if (className) button.className = className;

    button.addEventListener("click", action);

    return button;
  }

  async function shareGrove() {
    const shareData = {
      title: "Grove — A World Connected",
      text: "Join me on Grove.",
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        toast("Grove link copied.");
        return;
      }

      window.prompt("Copy the Grove link:", shareData.url);
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Grove sharing failed:", error);
        toast("Could not share Grove from this browser.");
      }
    }
  }

  async function switchAccount() {
    const button = document.activeElement;

    if (button) button.disabled = true;

    try {
      const { error } = await supabase.auth.signOut({
        scope: "local"
      });

      if (error) throw error;

      window.location.replace("/login.html?switch=1");
    } catch (error) {
      console.error("Grove account switch failed:", error);
      toast(error.message || "Could not switch accounts.");

      if (button) button.disabled = false;
    }
  }

  async function logOut() {
    const button = document.activeElement;

    if (button) button.disabled = true;

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      window.location.replace("/login.html?logged_out=1");
    } catch (error) {
      console.error("Grove logout failed:", error);
      toast(error.message || "Could not log out.");

      if (button) button.disabled = false;
    }
  }

  function renderAccountMenu(user) {
    const oldMenu = document.querySelector(".grove-account-controls");
    if (oldMenu) oldMenu.remove();

    const details = document.createElement("details");
    details.className = "grove-account-controls";

    const summary = document.createElement("summary");
    summary.textContent = user ? "Account ▾" : "Sign In ▾";

    const menu = document.createElement("div");
    menu.className = "grove-account-menu";

    if (user) {
      const profile = document.createElement("a");
      profile.href = "/profile.html";
      profile.textContent = "My Profile";

      menu.append(
        profile,
        createMenuItem("Add / Switch Account", switchAccount),
        createMenuItem("Share Grove", shareGrove)
      );

      const divider = document.createElement("div");
      divider.className = "grove-menu-divider";
      menu.append(divider);

      menu.append(
        createMenuItem("Log Out", logOut, "grove-logout")
      );
    } else {
      const login = document.createElement("a");
      login.href = "/login.html";
      login.textContent = "Log In";

      const join = document.createElement("a");
      join.href = "/login.html#register";
      join.textContent = "Join Grove";

      menu.append(login, join, createMenuItem("Share Grove", shareGrove));
    }

    details.append(summary, menu);

    const target = document.querySelector(
      ".site-header nav, .messages-navigation, .account-navigation"
    );

    if (target) {
      target.append(details);
    } else if (!document.querySelector(".auth-container")) {
      details.style.position = "fixed";
      details.style.top = "14px";
      details.style.right = "16px";
      details.style.zIndex = "10000";
      document.body.append(details);
    }
  }

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      const user = data.user || null;

      await applySavedBackground(user);
      renderAccountMenu(user);
    } catch (error) {
      console.warn("Grove account controls could not initialize:", error);
      renderAccountMenu(null);
    }
  }

  initialize();

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
      renderAccountMenu(session?.user || null);
    }
  });
}
