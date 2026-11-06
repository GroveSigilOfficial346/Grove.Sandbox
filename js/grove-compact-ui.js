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

      --grove-surface: rgba(16, 11, 37, .92);
      --grove-surface-raised: rgba(25, 16, 49, .94);
      --grove-surface-border: rgba(190, 155, 255, .18);
      --grove-surface-shadow:
        0 16px 42px rgba(0, 0, 0, .22);
    }

    /* TYPOGRAPHY */

    body {
      font-family: var(--grove-font-body, "DM Sans", system-ui, sans-serif);
      -webkit-font-smoothing: antialiased;
    }

    h1, h2, h3, h4,
    .header-title {
      font-family: var(--grove-font-display, "Space Grotesk", sans-serif);
      letter-spacing: -.025em;
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

    /* NAVIGATION */

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

    /* BRAND — PRESERVE THE EXISTING LOGO */

    .brand {
      text-shadow:
        0 0 9px rgba(133,30,255,.2),
        0 0 19px rgba(235,54,237,.1);
    }

    /* SHARED CARD SURFACES */

    .profile-card,
    .content-section,
    .messages-layout,
    .conversation-sidebar,
    .chat-panel {
      box-shadow: var(--grove-surface-shadow);
    }

    .profile-card,
    .content-section {
      border-color: var(--grove-surface-border);
      background:
        linear-gradient(
          145deg,
          rgba(29,18,54,.96),
          rgba(13,9,31,.97)
        );
      border-radius: 17px;
    }

    .profile-card {
      position: relative;
      isolation: isolate;
    }

    .profile-card::after,
    .content-section::after {
      content: "";
      position: absolute;
      top: 0;
      left: 8%;
      right: 8%;
      height: 1px;
      pointer-events: none;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(190,155,255,.3),
        rgba(5,201,244,.18),
        transparent
      );
    }

    .profile-card {
      overflow: hidden;
    }

    .content-section {
      position: relative;
      overflow: hidden;
    }

    /* PROFILE HEADER AND IDENTITY */

    .profile-identity h1 {
      font-weight: 700;
      letter-spacing: -.035em;
    }

    .profile-identity .muted,
    .profile-detail,
    .profile-bio {
      line-height: 1.65;
    }

    .profile-stats {
      gap: 9px;
    }

    .profile-stat {
      border-color: rgba(190,155,255,.2);
      border-radius: 10px;
      background: rgba(255,255,255,.035);
      transition:
        border-color .18s ease,
        background .18s ease,
        transform .18s ease;
    }

    .profile-stat:hover {
      border-color: rgba(5,201,244,.4);
      background: rgba(133,30,255,.1);
      transform: translateY(-1px);
    }

    /* SECTION HEADERS */

    .content-section > h1,
    .content-section > h2 {
      margin-bottom: 17px;
      padding-bottom: 13px;
      border-bottom: 1px solid rgba(190,155,255,.13);
      font-size: 1.16rem;
      font-weight: 700;
      letter-spacing: -.02em;
    }

    .section-eyebrow,
    .header-eyebrow {
      color: #bda8e8;
      font-size: .66rem;
      font-weight: 750;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    /* PROFILE TABS AND POSTS */

    .profile-social-tabs {
      border-color: var(--grove-surface-border);
      background: rgba(13,9,31,.88);
      box-shadow: 0 8px 24px rgba(0,0,0,.16);
    }

    .profile-social-tab {
      border-radius: 9px;
    }

    .profile-post,
    .profile-repost-card,
    .follow-request-card {
      border-color: rgba(190,155,255,.16);
      border-radius: 12px;
    }

    .profile-repost-card,
    .follow-request-card {
      background: rgba(25,16,49,.7);
      transition:
        border-color .18s ease,
        background .18s ease;
    }

    .profile-repost-card:hover,
    .follow-request-card:hover {
      border-color: rgba(160,105,255,.35);
      background: rgba(30,19,57,.88);
    }

    .profile-post-composer {
      border-color: rgba(160,105,255,.25);
      border-radius: 14px;
      background: rgba(10,7,27,.72);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
    }

    /* MESSAGING WORKSPACE */

    .messages-header {
      padding-bottom: 15px;
    }

    .messages-layout {
      border-color: rgba(190,155,255,.2);
      border-radius: 18px;
      background: rgba(12,8,29,.94);
      box-shadow: 0 18px 48px rgba(0,0,0,.24);
    }

    .conversation-sidebar {
      background: rgba(8,5,24,.62);
      border-color: rgba(190,155,255,.13);
      box-shadow: none;
    }

    .sidebar-heading {
      padding-bottom: 17px;
      border-bottom: 1px solid rgba(190,155,255,.12);
    }

    .sidebar-heading h2,
    .chat-heading h2 {
      font-weight: 700;
      letter-spacing: -.025em;
    }

    .conversation-item {
      border: 1px solid transparent;
      border-radius: 11px;
      transition:
        background .18s ease,
        border-color .18s ease,
        transform .18s ease;
    }

    .conversation-item:hover {
      border-color: rgba(160,105,255,.26);
      transform: translateX(2px);
    }

    .conversation-item.active {
      border-color: rgba(160,105,255,.4);
    }

    .chat-panel {
      background: rgba(15,10,34,.48);
      box-shadow: none;
    }

    .chat-heading {
      border-color: rgba(190,155,255,.14);
      background: rgba(25,16,49,.66);
    }

    .message-bubble {
      border-radius: 15px;
    }

    .message-form {
      border-color: rgba(190,155,255,.14);
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

      .content-section {
        border-radius: 13px;
      }

      .content-section > h1,
      .content-section > h2 {
        font-size: 1.05rem;
      }

      .messages-layout {
        border-radius: 13px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      button,
      .button,
      a,
      input,
      select,
      textarea,
      .conversation-item,
      .profile-stat {
        transition: none !important;
      }
    }
  `;

  document.head.append(style);
}
