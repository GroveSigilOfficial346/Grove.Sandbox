export function installGroveUpdates(supabase) {
  "use strict";

  if (
    document.querySelector("main .account-navigation") ||
    document.querySelector(".auth-container") ||
    document.getElementById("grove-updates-ticker")
  ) {
    return;
  }

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/css/grove-updates.css?v=20261112-1";
  document.head.append(stylesheet);

  let updates = [];
  let selectedIndex = 0;
  let isAdmin = false;

  const ticker = document.createElement("section");
  ticker.id = "grove-updates-ticker";
  ticker.className = "grove-updates-ticker";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "grove-updates-trigger";
  trigger.setAttribute("aria-label", "Open Grove updates");

  const label = document.createElement("span");
  label.className = "grove-updates-label";
  label.textContent = "GROVE UPDATES";

  const viewport = document.createElement("span");
  viewport.className = "grove-updates-viewport";

  const track = document.createElement("span");
  track.className = "grove-updates-track";

  const firstCopy = document.createElement("span");
  firstCopy.className = "grove-updates-track-copy";

  const secondCopy = document.createElement("span");
  secondCopy.className = "grove-updates-track-copy";
  secondCopy.setAttribute("aria-hidden", "true");

  track.append(firstCopy, secondCopy);
  viewport.append(track);

  const openIcon = document.createElement("span");
  openIcon.className = "grove-updates-open-icon";
  openIcon.textContent = "↗";

  trigger.append(label, viewport, openIcon);
  ticker.append(trigger);

  const dialog = document.createElement("dialog");
  dialog.id = "grove-updates-dialog";
  dialog.className = "grove-updates-dialog";

  const panel = document.createElement("div");
  panel.className = "grove-updates-panel";

  const header = document.createElement("header");
  header.className = "grove-updates-dialog-header";

  const headingGroup = document.createElement("div");

  const eyebrow = document.createElement("span");
  eyebrow.className = "grove-updates-eyebrow";
  eyebrow.textContent = "GROVE NETWORK";

  const heading = document.createElement("h2");
  heading.textContent = "What's new in Grove";

  const description = document.createElement("p");
  description.textContent =
    "New features, improvements, announcements, and fixes.";

  headingGroup.append(eyebrow, heading, description);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "grove-updates-close";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close updates");

  closeButton.addEventListener("click", () => dialog.close());

  header.append(headingGroup, closeButton);

  const content = document.createElement("div");
  content.className = "grove-updates-content";

  const list = document.createElement("nav");
  list.className = "grove-updates-list";
  list.setAttribute("aria-label", "All Grove updates");

  const detail = document.createElement("article");
  detail.className = "grove-updates-detail";

  const category = document.createElement("span");
  category.className = "grove-update-category";

  const date = document.createElement("time");
  date.className = "grove-update-date";

  const detailTitle = document.createElement("h3");

  const summary = document.createElement("p");
  summary.className = "grove-update-summary";

  const body = document.createElement("div");
  body.className = "grove-update-body";

  detail.append(category, date, detailTitle, summary, body);
  content.append(list, detail);

  const footer = document.createElement("footer");
  footer.className = "grove-updates-footer";

  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "← Previous";
  previous.className = "grove-updates-page-button";

  const position = document.createElement("span");
  position.className = "grove-updates-position";

  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next →";
  next.className = "grove-updates-page-button";

  previous.addEventListener("click", () => {
    selectUpdate(selectedIndex - 1);
  });

  next.addEventListener("click", () => {
    selectUpdate(selectedIndex + 1);
  });

  footer.append(previous, position, next);

  const manage = document.createElement("a");
  manage.href = "/updates.html";
  manage.className = "grove-updates-manage";
  manage.textContent = "Manage updates";
  manage.hidden = true;

  panel.append(header, content, footer, manage);
  dialog.append(panel);

  trigger.addEventListener("click", () => {
    renderList();

    if (updates.length) {
      selectUpdate(
        Math.min(selectedIndex, updates.length - 1)
      );
    }

    if (!dialog.open) dialog.showModal();
  });

  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  document.body.prepend(ticker);
  document.body.append(dialog);

  function formatDate(value) {
    if (!value) return "Recently updated";

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return "Recently updated";
    }

    return parsed.toLocaleDateString([], {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function renderTicker() {
    const message = updates.length
      ? updates.map(update =>
          `${update.category.toUpperCase()}  ·  ${update.title}`
        ).join("     ✦     ")
      : "Grove updates are being prepared. Stay tuned.";

    firstCopy.textContent = message;
    secondCopy.textContent = message;

    track.classList.toggle("is-static", updates.length === 0);
  }

  function renderList() {
    list.replaceChildren();

    if (!updates.length) {
      const empty = document.createElement("p");
      empty.className = "grove-updates-empty";
      empty.textContent =
        "No published updates yet. Check back soon.";

      list.append(empty);
      detail.hidden = true;
      footer.hidden = true;
      return;
    }

    detail.hidden = false;
    footer.hidden = false;

    updates.forEach((update, index) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "grove-update-list-item";

      if (index === selectedIndex) {
        button.classList.add("active");
      }

      const itemCategory = document.createElement("span");
      itemCategory.textContent = update.category.toUpperCase();

      const itemTitle = document.createElement("strong");
      itemTitle.textContent = update.title;

      const itemDate = document.createElement("small");
      itemDate.textContent = formatDate(update.published_at);

      button.append(itemCategory, itemTitle, itemDate);

      button.addEventListener("click", () => {
        selectUpdate(index);
      });

      list.append(button);
    });
  }

  function selectUpdate(index) {
    if (!updates.length) return;

    selectedIndex = Math.max(
      0,
      Math.min(index, updates.length - 1)
    );

    const update = updates[selectedIndex];

    category.textContent = update.category.toUpperCase();
    date.textContent = formatDate(update.published_at);
    date.dateTime = update.published_at || "";

    detailTitle.textContent = update.title;
    summary.textContent = update.summary || "";
    body.textContent = update.body || "";

    position.textContent =
      `${selectedIndex + 1} of ${updates.length}`;

    previous.disabled = selectedIndex === 0;
    next.disabled = selectedIndex === updates.length - 1;

    renderList();
  }

  async function loadUpdates() {
    const { data, error } = await supabase
      .from("grove_updates")
      .select(
        "id,title,summary,body,category,published_at"
      )
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    updates = data || [];

    renderTicker();
    renderList();
  }

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      if (!data.user) return;

      const { data: admin } = await supabase
        .from("grove_admins")
        .select("role")
        .eq("user_id", data.user.id)
        .maybeSingle();

      isAdmin = ["owner", "admin"].includes(admin?.role);

      manage.hidden = !isAdmin;

      await loadUpdates();

    } catch (error) {
      console.warn("Grove updates could not load:", error);

      firstCopy.textContent =
        "Grove updates are temporarily unavailable.";

      secondCopy.textContent =
        "Grove updates are temporarily unavailable.";
    }
  }

  initialize();
}
