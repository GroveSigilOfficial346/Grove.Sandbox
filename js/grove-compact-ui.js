export function installGroveCompactUI() {
  "use strict";

  if (document.getElementById("grove-compact-ui")) return;

  const style = document.createElement("style");
  style.id = "grove-compact-ui";

  style.textContent = `
    /* =====================================
       GROVE COMPACT INTERFACE
       Preserve existing colors and surfaces.
       ===================================== */

    button,
    .button,
    a.button,
    input[type="submit"],
    input[type="button"] {
      min-height: 36px !important;
      padding: 7px 12px !important;
      border-radius: 8px !important;
      font-size: .84rem !important;
      line-height: 1.2 !important;
      font-weight: 650;
      letter-spacing: .005em;
      transition:
        transform .16s ease,
        box-shadow .16s ease,
        filter .16s ease,
        border-color .16s ease;
    }

    button:hover,
    .button:hover,
    a.button:hover,
    input[type="submit"]:hover,
    input[type="button"]:hover {
      filter: brightness(1.08);
      box-shadow:
        0 0 0 1px rgba(190, 150, 255, .12),
        0 0 13px rgba(133, 30, 255, .16);
    }

    button:active,
    .button:active,
    a.button:active {
      transform: translateY(1px);
    }

    button:focus-visible,
    .button:focus-visible,
    a.button:focus-visible {
      outline: 2px solid rgba(5, 201, 244, .85);
      outline-offset: 2px;
    }

    button:disabled,
    .button:disabled {
      cursor: not-allowed;
      filter: none;
      box-shadow: none;
      transform: none;
    }

    /* Tighter navigation without changing its layout. */

    .site-header nav {
      gap: 7px 12px;
    }

    .site-header nav a {
      padding: 5px 7px;
      border-radius: 6px;
      font-size: .84rem;
      transition:
        color .16s ease,
        background .16s ease;
    }

    .site-header nav a:hover,
    .site-header nav a[aria-current="page"] {
      background: rgba(133, 30, 255, .10);
    }

    /* Same wordmark, restrained violet glow. */

    .brand {
      text-shadow:
        0 0 8px rgba(133, 30, 255, .25),
        0 0 17px rgba(235, 54, 237, .12);
    }

    /* Tighter common control spacing. */

    .profile-actions,
    .upload-actions,
    .device-actions,
    .profile-post-submit-row {
      gap: 8px;
    }

    .profile-stat {
      padding: 6px 10px;
    }

    .grove-account-controls summary {
      min-height: 34px !important;
      padding: 6px 10px !important;
      font-size: .8rem !important;
    }

    .grove-account-menu a,
    .grove-account-menu button {
      min-height: 34px !important;
      padding: 7px 9px !important;
      font-size: .82rem !important;
    }

    .grove-relationship-date {
      color: var(--cyan, #05c9f4);
    }

    @media (max-width: 600px) {
      button,
      .button,
      a.button,
      input[type="submit"],
      input[type="button"] {
        min-height: 36px !important;
        padding: 7px 10px !important;
        font-size: .81rem !important;
      }

      .site-header nav {
        gap: 6px 8px;
      }

      .site-header nav a {
        padding: 5px 6px;
        font-size: .8rem;
      }
    }

    /* Keep controls comfortable on touchscreens. */

    @media (pointer: coarse) {
      button,
      .button,
      a.button,
      input[type="submit"],
      input[type="button"] {
        min-height: 40px !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      button,
      .button,
      a.button {
        transition: none !important;
      }
    }
  `;

  document.head.append(style);
}
