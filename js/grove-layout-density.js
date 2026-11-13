const STORAGE_KEY = "grove:layout-density";
const VALID_MODES = new Set(["compact", "standard", "expanded"]);

const DENSITY_LABELS = {
  compact: "Compact",
  standard: "Standard",
  expanded: "Expanded"
};

function readDensity() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.has(saved) ? saved : "standard";
  } catch {
    return "standard";
  }
}

function applyDensity(mode) {
  const safeMode = VALID_MODES.has(mode) ? mode : "standard";

  document.documentElement.dataset.groveDensity = safeMode;

  try {
    localStorage.setItem(STORAGE_KEY, safeMode);
  } catch (error) {
    console.warn("Grove could not save the layout preference:", error);
  }

  document.dispatchEvent(
    new CustomEvent("grove:layout-density-changed", {
      detail: { density: safeMode }
    })
  );

  return safeMode;
}

function addDensityControl() {
  const panel = document.querySelector("[data-grove-layout-settings]");
  const select = document.getElementById("grove-layout-density");
  const status = document.getElementById("grove-layout-density-status");
  const reset = document.getElementById("grove-layout-density-reset");

  if (!panel || !select) return;

  select.value = readDensity();

  select.addEventListener("change", () => {
    const selected = applyDensity(select.value);

    if (status) {
      status.textContent =
        `${DENSITY_LABELS[selected]} layout applied and saved on this device.`;
    }
  });

  reset?.addEventListener("click", () => {
    select.value = "standard";
    const selected = applyDensity("standard");

    if (status) {
      status.textContent =
        `${DENSITY_LABELS[selected]} layout restored.`;
    }
  });
}

export function installGroveLayoutDensity() {
  if (window.__groveLayoutDensityInstalled) return;

  window.__groveLayoutDensityInstalled = true;

  applyDensity(readDensity());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addDensityControl, {
      once: true
    });
  } else {
    addDensityControl();
  }
}
