import { supabase } from "./supabase.js";

const STORAGE_PREFIX = "grove:messages-theme:";

const THEMES = [
  { value: "violet", label: "Violet" },
  { value: "ocean", label: "Ocean" },
  { value: "rose", label: "Rose" },
  { value: "forest", label: "Forest" },
  { value: "mono", label: "Midnight" }
];

function getSavedTheme(userId) {
  try {
    const saved = localStorage.getItem(
      STORAGE_PREFIX + userId
    );

    return THEMES.some(theme => theme.value === saved)
      ? saved
      : "violet";
  } catch {
    return "violet";
  }
}

function saveTheme(userId, theme) {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + userId,
      theme
    );
  } catch (error) {
    console.warn("Could not save Grove chat theme:", error);
  }
}

function applyTheme(theme) {
  document.body.dataset.chatTheme = theme;
}

function createThemeControl(userId) {
  const navigation = document.querySelector(
    ".messages-navigation"
  );

  if (!navigation) return;

  navigation.querySelector(".chat-theme-control")?.remove();

  const wrapper = document.createElement("label");
  wrapper.className = "chat-theme-control";

  const label = document.createElement("span");
  label.textContent = "Chat theme";

  const select = document.createElement("select");
  select.id = "chat-theme-select";
  select.setAttribute("aria-label", "Choose chat theme");

  for (const theme of THEMES) {
    const option = document.createElement("option");
    option.value = theme.value;
    option.textContent = theme.label;
    select.append(option);
  }

  select.value = getSavedTheme(userId);

  select.addEventListener("change", () => {
    const selected = THEMES.some(
      theme => theme.value === select.value
    )
      ? select.value
      : "violet";

    applyTheme(selected);
    saveTheme(userId, selected);
  });

  wrapper.append(label, select);
  navigation.append(wrapper);
}

async function initialize() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.warn("Could not load chat theme account:", error);
    return;
  }

  const user = data.user;

  if (!user) return;

  const theme = getSavedTheme(user.id);

  applyTheme(theme);
  createThemeControl(user.id);
}

initialize();
