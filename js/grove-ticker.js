(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";

  const STYLE_ID = "grove-ticker-styles";
  const ROOT_ID = "grove-live-ticker";

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        width: 100%;
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        min-height: 42px;
        background: linear-gradient(90deg,#10082b,#17103b,#10082b);
        border-top: 1px solid #851eff55;
        border-bottom: 1px solid #45e5ff44;
        color: #f7f5ff;
        font: 12px Inter,system-ui,sans-serif;
      }

      #${ROOT_ID} .grove-ticker-label {
        position: relative;
        z-index: 2;
        flex: 0 0 auto;
        padding: 0 15px;
        min-height: 42px;
        display: flex;
        align-items: center;
        background: #211440;
        color: #45e5ff;
        font-weight: 900;
        letter-spacing: 2px;
        border-right: 1px solid #45e5ff44;
      }

      #${ROOT_ID} .grove-ticker-window {
        min-width: 0;
        overflow: hidden;
        flex: 1;
      }

      #${ROOT_ID} .grove-ticker-track {
        display: flex;
        width: max-content;
        animation: groveTickerScroll 38s linear infinite;
      }

      #${ROOT_ID}:hover .grove-ticker-track {
        animation-play-state: paused;
      }

      #${ROOT_ID} .grove-ticker-item {
        white-space: nowrap;
        padding: 0 30px;
        color: #e7ddff;
      }

      #${ROOT_ID} .grove-ticker-item::before {
        content: "✦";
        color: #45e5ff;
        margin-right: 12px;
      }

      #${ROOT_ID} a {
        color: inherit;
        text-decoration: none;
      }

      #${ROOT_ID} a:hover {
        color: #45e5ff;
      }

      @keyframes groveTickerScroll {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }

      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} .grove-ticker-track {
          animation: none;
          width: 100%;
          overflow-x: auto;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function installTicker() {
    if (document.getElementById(ROOT_ID)) return;

    const ticker = document.createElement("section");
    ticker.id = ROOT_ID;
    ticker.setAttribute("aria-label", "Grove community updates");

    ticker.innerHTML = `
      <div class="grove-ticker-label">GROVE LIVE</div>
      <div class="grove-ticker-window">
        <div class="grove-ticker-track">
          <span class="grove-ticker-item">
            Welcome to Grove — A World Connected.
          </span>
          <span class="grove-ticker-item">
            Community updates loading…
          </span>
        </div>
      </div>
    `;

    const header = document.querySelector("header");

    if (header) {
      header.insertAdjacentElement("afterend", ticker);
    } else {
      document.body.prepend(ticker);
    }
  }

  function renderTicker(messages) {
    const track = document.querySelector(
      `#${ROOT_ID} .grove-ticker-track`
    );

    if (!track) return;

    const items = messages.length
      ? messages
      : ["Welcome to Grove — A World Connected."];

    const markup = items.map(message => `
      <span class="grove-ticker-item">
        <a href="community.html">${escapeHTML(message)}</a>
      </span>
    `).join("");

    track.innerHTML = markup + markup;
  }

  async function loadTicker(db) {
    try {
      const { data, error } = await db
        .from("posts")
        .select("body,created_at")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) throw error;

      const messages = (data || [])
        .map(post => String(post.body || "").trim())
        .filter(Boolean)
        .map(body => body.length > 110
          ? body.slice(0, 107) + "…"
          : body
        );

      renderTicker(messages);
    } catch (error) {
      console.error("Grove ticker:", error);
      renderTicker([
        "Welcome to Grove — A World Connected.",
        "Visit the Community to connect with members."
      ]);
    }
  }

  async function start() {
    installStyles();
    installTicker();

    if (!window.supabase) {
      renderTicker(["Welcome to Grove — A World Connected."]);
      return;
    }

    const db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

    await loadTicker(db);

    window.setInterval(() => {
      loadTicker(db);
    }, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
