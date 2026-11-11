const DEFAULT_STYLE = "ember";
const DEFAULT_COLOR = "#D9A15B";

const ALLOWED_STYLES = new Set([
  "ember",
  "gothic",
  "violet",
  "rose",
  "forest",
  "monochrome"
]);

const STYLE_DEFAULTS = {
  ember: "#D9A15B",
  gothic: "#B6A38A",
  violet: "#9B72FF",
  rose: "#D985A8",
  forest: "#77B88A",
  monochrome: "#B6BBC5"
};

function validStyle(value) {
  return ALLOWED_STYLES.has(value) ? value : DEFAULT_STYLE;
}

function validColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || ""))
    ? value
    : DEFAULT_COLOR;
}

function colorChannels(hex) {
  const value = hex.replace("#", "");

  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ].join(", ");
}

function installStyles() {
  if (document.getElementById("grove-button-theme-styles")) return;

  const style = document.createElement("style");
  style.id = "grove-button-theme-styles";

  style.textContent = `
    html[data-grove-button-style] {
      --grove-button-radius: 11px;
      --grove-button-font: inherit;
    }

    html[data-grove-button-style] body
    button:not(.danger):not(.delete-button):not(.remove-button):not(.grove-logout),
    html[data-grove-button-style] body
    .button:not(.danger),
    html[data-grove-button-style] body
    .file-button,
    html[data-grove-button-style] body
    .primary-link,
    html[data-grove-button-style] body
    input[type="submit"],
    html[data-grove-button-style] body
    input[type="button"],
    html[data-grove-button-style] body
    .send-button,
    html[data-grove-button-style] body
    .audio-attach-button,
    html[data-grove-button-style] body
    .audio-record-button {
      border-color: rgba(var(--grove-button-rgb), .55) !important;
      border-radius: var(--grove-button-radius) !important;
      font-family: var(--grove-button-font) !important;
      transition:
        background .2s ease,
        border-color .2s ease,
        color .2s ease,
        box-shadow .2s ease,
        transform .2s ease !important;
    }

    html[data-grove-button-style] body
    button:not(.danger):not(.delete-button):not(.remove-button):not(.grove-logout):not(:disabled),
    html[data-grove-button-style] body
    .button:not(.danger),
    html[data-grove-button-style] body
    .file-button,
    html[data-grove-button-style] body
    .primary-link {
      background:
        linear-gradient(
          135deg,
          rgba(var(--grove-button-rgb), .19),
          rgba(var(--grove-button-rgb), .055)
        ) !important;
      color: #F7F3EC !important;
    }

    html[data-grove-button-style] body
    button.primary:not(.danger),
    html[data-grove-button-style] body
    .button.primary,
    html[data-grove-button-style] body
    .primary-link,
    html[data-grove-button-style] body
    .send-button,
    html[data-grove-button-style] body
    #join-button {
      background:
        linear-gradient(
          135deg,
          rgba(var(--grove-button-rgb), .72),
          rgba(var(--grove-button-rgb), .30)
        ) !important;
      border-color: var(--grove-button-accent) !important;
      color: #FFFFFF !important;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.13),
        0 5px 18px rgba(var(--grove-button-rgb), .12) !important;
    }

    html[data-grove-button-style] body
    button:hover:not(:disabled):not(.danger):not(.delete-button):not(.remove-button),
    html[data-grove-button-style] body
    .button:hover:not(:disabled):not(.danger),
    html[data-grove-button-style] body
    .file-button:hover {
      border-color: var(--grove-button-accent) !important;
      box-shadow:
        0 0 0 2px rgba(var(--grove-button-rgb), .10),
        0 7px 20px rgba(var(--grove-button-rgb), .12) !important;
      filter: brightness(1.12);
    }

    html[data-grove-button-style="gothic"] {
      --grove-button-radius: 4px;
      --grove-button-font: Georgia, "Times New Roman", serif;
    }

    html[data-grove-button-style="gothic"] body
    button:not(.danger):not(.delete-button):not(.remove-button):not(.grove-logout),
    html[data-grove-button-style="gothic"] body
    .button:not(.danger),
    html[data-grove-button-style="gothic"] body
    .file-button,
    html[data-grove-button-style="gothic"] body
    .primary-link {
      border-style: double !important;
      border-width: 3px !important;
      background: linear-gradient(145deg, #21191B, #080609) !important;
      color: #E9DFD2 !important;
      letter-spacing: .045em;
      box-shadow:
        inset 0 0 0 1px rgba(var(--grove-button-rgb), .12),
        0 6px 18px rgba(0,0,0,.34) !important;
    }

    html[data-grove-button-style="gothic"] body
    button.primary:not(.danger),
    html[data-grove-button-style="gothic"] body
    .button.primary,
    html[data-grove-button-style="gothic"] body
    .primary-link,
    html[data-grove-button-style="gothic"] body
    .send-button {
      border-color: var(--grove-button-accent) !important;
      background: linear-gradient(145deg, #35262A, #110B10) !important;
      color: #F2E7D9 !important;
    }

    html[data-grove-button-style="monochrome"] body
    button:not(.danger):not(.delete-button):not(.remove-button):not(.grove-logout),
    html[data-grove-button-style="monochrome"] body
    .button:not(.danger),
    html[data-grove-button-style="monochrome"] body
    .file-button {
      background: linear-gradient(135deg, #303039, #141419) !important;
      color: #EEEEF2 !important;
    }

    html[data-grove-button-style] body
    button:disabled,
    html[data-grove-button-style] body
    .button:disabled {
      opacity: .48 !important;
      cursor: not-allowed !important;
      box-shadow: none !important;
    }

    @media (max-width: 640px) {
      html[data-grove-button-style] body
      button:not(.danger),
      html[data-grove-button-style] body
      .button,
      html[data-grove-button-style] body
      .file-button {
        min-height: 40px;
      }
    }
  `;

  document.head.append(style);
}

export function applyGroveButtonTheme(styleValue, colorValue) {
  installStyles();

  const style = validStyle(styleValue);
  const color = validColor(colorValue);
  const root = document.documentElement;

  root.dataset.groveButtonStyle = style;
  root.style.setProperty("--grove-button-accent", color);
  root.style.setProperty(
    "--grove-button-rgb",
    colorChannels(color)
  );

  return { style, color };
}

export function getGroveButtonDefaults(styleValue) {
  const style = validStyle(styleValue);

  return {
    style,
    color: STYLE_DEFAULTS[style]
  };
}

export function installGroveButtonTheme(supabase) {
  if (window.__groveButtonThemeInstalled) return;

  window.__groveButtonThemeInstalled = true;

  applyGroveButtonTheme(DEFAULT_STYLE, DEFAULT_COLOR);

  async function loadForUser(user) {
    if (!user) {
      applyGroveButtonTheme(DEFAULT_STYLE, DEFAULT_COLOR);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("button_style,button_color")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      applyGroveButtonTheme(
        data?.button_style || DEFAULT_STYLE,
        data?.button_color || DEFAULT_COLOR
      );
    } catch (error) {
      console.warn("Grove button preferences unavailable:", error);
      applyGroveButtonTheme(DEFAULT_STYLE, DEFAULT_COLOR);
    }
  }

  supabase.auth.getUser()
    .then(({ data, error }) => {
      if (error) throw error;
      return loadForUser(data.user || null);
    })
    .catch(error => {
      console.warn("Grove button theme could not load:", error);
    });

  supabase.auth.onAuthStateChange((_event, session) => {
    loadForUser(session?.user || null);
  });
}
