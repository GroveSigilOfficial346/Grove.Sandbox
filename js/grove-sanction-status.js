export function installGroveSanctionStatus(supabase) {
  "use strict";

  const STYLE_ID = "grove-sanction-status-style";
  const BANNER_ID = "grove-sanction-status-banner";

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BANNER_ID} {
        position: relative;
        z-index: 9998;
        width: min(900px, calc(100% - 28px));
        margin: 14px auto;
        padding: 16px 18px;
        border: 1px solid rgba(255,133,133,.55);
        border-radius: 12px;
        background: rgba(75,15,35,.96);
        color: #fff;
        font: 14px/1.6 system-ui, sans-serif;
      }

      #${BANNER_ID} strong {
        display: block;
        margin-bottom: 5px;
        color: #ffb2b2;
        font-size: 16px;
      }

      #${BANNER_ID} a {
        color: #8beaff;
        text-decoration: underline;
      }
    `;

    document.head.append(style);
  }

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  function showBanner(sanction) {
    removeBanner();
    addStyles();

    const banner = document.createElement("section");
    banner.id = BANNER_ID;
    banner.setAttribute("role", "alert");

    const heading = document.createElement("strong");
    heading.textContent =
      sanction.sanction_type === "ban"
        ? "Grove account banned"
        : "Grove account temporarily suspended";

    const detail = document.createElement("p");
    detail.textContent =
      sanction.reason || "An account restriction is currently active.";

    const expiry = document.createElement("p");

    expiry.textContent = sanction.ends_at
      ? "Restriction ends: " +
        new Date(sanction.ends_at).toLocaleString()
      : "This restriction currently has no scheduled end date.";

    const note = document.createElement("p");
    note.textContent =
      "Creating posts, following members, and sending messages are restricted while this sanction is active. Reading and permitted account actions remain available.";

    const settingsLink = document.createElement("a");
    settingsLink.href = "/settings.html";
    settingsLink.textContent = "Account settings";

    banner.append(heading, detail, expiry, note, settingsLink);

    document.body.prepend(banner);
  }

  async function refresh(user) {
    if (!user) {
      removeBanner();
      return;
    }

    const now = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from("user_sanctions")
        .select("sanction_type,reason,starts_at,ends_at,created_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("sanction_type", ["suspension", "ban"])
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        showBanner(data);
      } else {
        removeBanner();
      }
    } catch (error) {
      console.error("Grove sanction status could not load:", error);
    }
  }

  supabase.auth.getUser().then(({ data, error }) => {
    if (error) {
      console.warn("Grove sanction status authentication check failed:", error);
      return;
    }

    refresh(data.user || null);
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      refresh(session?.user || null);
    }
  });
}
