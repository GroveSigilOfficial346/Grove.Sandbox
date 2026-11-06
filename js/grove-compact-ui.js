export function installGroveCompactUI() {
  "use strict";

  if (document.getElementById("grove-compact-ui")) return;

  const style = document.createElement("style");
  style.id = "grove-compact-ui";

  style.textContent = `
    :root {
      --grove-control-bg: rgba(19, 13, 39, .94);
      --grove-control-border: rgba(160, 105, 255, .34);
      --grove-control-hover: rgba(133, 30, 255, .17);
      --grove-control-text: #f7f5ff;
      --grove-control-muted: #c4bbd8;
      --grove-control-glow: 0 8px 22px rgba(0, 0, 0, .22);
    }

    /* BUTTON FOUNDATION */

    button,
    .button,
    .file-button,
    .primary-link,
    input[type="button"],
    input[type="submit"] {
      font-family: var(--grove-font-body, "DM Sans", system-ui, sans-serif);
      font-weight: 650;
      letter-spacing: .01em;
      -webkit-tap-highlight-color: transparent;
      transition:
        background .18s ease,
        border-color .18s ease,
        color .18s ease,
        box-shadow .18s ease,
        transform .18s ease,
        filter .18s ease;
    }

    /* STANDARD ACTIONS */

    button:not(:disabled),
    .button,
    .file-button,
    .primary-link,
    input[type="button"],
    input[type="submit"] {
      box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
    }

    button:not(:disabled):hover,
    .button:hover,
    .file-button:hover,
    .primary-link:hover {
      filter: brightness(1.08);
      box-shadow:
        0 0 0 1px rgba(190,155,255,.12),
        0 7px 20px rgba(0,0,0,.2);
    }

    button:not(:disabled):active,
    .button:active,
    .file-button:active,
    .primary-link:active {
      transform: translateY(1px) scale(.985);
    }

    button:disabled,
    .button:disabled {
      cursor: not-allowed;
      opacity: .48;
      filter: grayscale(.2);
      box-shadow: none;
    }

    /* PRIMARY ACTIONS */

    .button.primary,
    .primary-link,
    .send-button,
    #join-button {
      box-shadow:
        0 5px 18px rgba(133,30,255,.19),
        inset 0 1px 0 rgba(255,255,255,.17);
    }

    .button.primary:hover,
    .primary-link:hover,
    .send-button:not(:disabled):hover,
    #join-button:hover {
      box-shadow:
        0 0 0 3px rgba(235,54,237,.09),
        0 9px 26px rgba(133,30,255,.25);
      filter: brightness(1.1);
    }

    /* SECONDARY ACTIONS */

    .button.secondary {
      background: linear-gradient(
        135deg,
        rgba(255,255,255,.055),
        rgba(133,30,255,.075)
      );
      border-color: rgba(190,155,255,.25);
      color: var(--grove-control-text);
    }

    .button.secondary:hover {
      background: rgba(133,30,255,.16);
      border-color: rgba(5,201,244,.55);
      color: white;
    }

    /* NAVIGATION — TABS, NOT PLAIN LINKS */

    .site-header nav,
    .messages-navigation,
    .feed-header nav {
      gap: 7px 9px;
    }

    .site-header nav a,
    .messages-navigation a,
    .feed-header nav a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 7px 12px;
      border: 1px solid transparent;
      border-radius: 9px;
      color: var(--grove-control-muted);
      font-size: .88rem;
      font-weight: 650;
      text-decoration: none;
      transition:
        color .18s ease,
        background .18s ease,
        border-color .18s ease,
        box-shadow .18s ease;
    }

    .site-header nav a:hover,
    .messages-navigation a:hover,
    .feed-header nav a:hover {
      color: white;
      border-color: rgba(160,105,255,.28);
      background: rgba(133,30,255,.12);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }

    .site-header nav a[aria-current="page"],
    .messages-navigation a[aria-current="page"],
    .feed-header nav a[aria-current="page"] {
      color: white;
      border-color: rgba(160,105,255,.42);
      background: linear-gradient(
        120deg,
        rgba(133,30,255,.22),
        rgba(5,201,244,.07)
      );
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.07),
        0 4px 14px rgba(0,0,0,.14);
    }

    /* BRAND — KEEP THE EXISTING LOGO */

    .brand {
      text-shadow:
        0 0 9px rgba(133,30,255,.2),
        0 0 19px rgba(235,54,237,.1);
    }

    /* FEED AND PROFILE ACTIONS */

    .feed-action,
    .profile-social-tab {
      border-radius: 9px;
      transition:
        background .18s ease,
        border-color .18s ease,
        color .18s ease,
        box-shadow .18s ease;
    }

    .feed-action:hover,
    .profile-social-tab:hover {
      box-shadow: 0 5px 16px rgba(0,0,0,.18);
    }

    /* FORM CONTROLS */

    input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
    textarea,
    select {
      font-family: var(--grove-font-body, "DM Sans", system-ui, sans-serif);
      border-radius: 9px;
    }

    input:focus,
    textarea:focus,
    select:focus {
      outline: none;
      border-color: rgba(5,201,244,.7);
      box-shadow: 0 0 0 3px rgba(5,201,244,.08);
    }

    /* ACCOUNT MENU */

    .grove-account-controls summary {
      min-height: 36px;
      padding: 7px 12px;
      border-radius: 9px;
      font-size: .86rem;
    }

    .grove-account-menu a,
    .grove-account-menu button {
      min-height: 36px;
      padding: 8px 11px;
      border-radius: 8px;
      font-size: .86rem;
    }

    /* RELATIONSHIP DATE */

    .grove-relationship-date {
      color: var(--grove-cyan, #05c9f4);
      font-weight: 650;
    }

    /* TOUCHSCREENS */

    @media (pointer: coarse) {
      button,
      .button,
      .file-button,
      .primary-link,
      input[type="button"],
      input[type="submit"] {
        min-height: 40px;
      }
    }

    @media (max-width: 640px) {
      .site-header nav,
      .messages-navigation,
      .feed-header nav {
        gap: 6px;
      }

      .site-header nav a,
      .messages-navigation a,
      .feed-header nav a {
        min-height: 35px;
        padding: 7px 9px;
        font-size: .84rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      button,
      .button,
      a,
      input,
      select,
      textarea {
        transition: none !important;
      }
    }
  `;

  document.head.append(style);
}
