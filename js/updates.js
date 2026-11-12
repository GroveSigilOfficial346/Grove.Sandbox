import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const form = document.getElementById("grove-update-form");
  const adminArea = document.getElementById("updates-admin-area");
  const statusNode = document.getElementById("updates-admin-status");
  const records = document.getElementById("grove-update-records");
  const saveButton = document.getElementById("grove-update-save");
  const resetButton = document.getElementById("grove-update-reset");
  const formTitle = document.getElementById("grove-update-form-title");

  if (!form || !adminArea || !statusNode || !records) return;

  const fields = {
    title: document.getElementById("update-title"),
    summary: document.getElementById("update-summary"),
    category: document.getElementById("update-category"),
    body: document.getElementById("update-body"),
    status: document.getElementById("update-status")
  };

  let user = null;
  let isAdmin = false;
  let saving = false;
  let updates = [];

  function showStatus(message, error = false) {
    statusNode.textContent = message || "";
    statusNode.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function resetForm() {
    form.reset();
    delete form.dataset.editId;

    fields.status.value = "draft";
    formTitle.textContent = "Create an update";
    saveButton.textContent = "Save update";
  }

  function formatDate(value) {
    if (!value) return "Draft";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Date unavailable";

    return date.toLocaleString();
  }

  function createElement(tag, className, value) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;

    return element;
  }

  function editUpdate(update) {
    form.dataset.editId = update.id;

    fields.title.value = update.title;
    fields.summary.value = update.summary || "";
    fields.category.value = update.category;
    fields.body.value = update.body || "";
    fields.status.value = update.status;

    formTitle.textContent = "Edit update";
    saveButton.textContent = "Save changes";

    form.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function deleteUpdate(update) {
    const confirmed = window.confirm(
      `Delete "${update.title}" permanently?`
    );

    if (!confirmed) return;

    try {
      showStatus("Deleting update...");

      const { error } = await supabase
        .from("grove_updates")
        .delete()
        .eq("id", update.id);

      if (error) throw error;

      showStatus("Update deleted.");

      if (form.dataset.editId === update.id) {
        resetForm();
      }

      await loadUpdates();

    } catch (error) {
      console.error("Update deletion failed:", error);

      showStatus(
        error.message || "Could not delete this update.",
        true
      );
    }
  }

  function renderUpdates() {
    records.replaceChildren();

    if (!updates.length) {
      records.append(
        createElement(
          "p",
          "grove-update-empty",
          "No updates have been created yet."
        )
      );

      return;
    }

    for (const update of updates) {
      const card = createElement("article", "grove-update-admin-card");

      const heading = createElement("h3", "", update.title);

      const meta = createElement(
        "p",
        "grove-update-admin-meta",
        `${update.category.toUpperCase()} · ${update.status.toUpperCase()} · ${formatDate(update.published_at)}`
      );

      const summary = createElement(
        "p",
        "grove-update-admin-summary",
        update.summary || "No summary"
      );

      const actions = createElement(
        "div",
        "grove-update-admin-actions"
      );

      const edit = createElement("button", "", "Edit");
      edit.type = "button";
      edit.addEventListener("click", () => editUpdate(update));

      const remove = createElement("button", "danger", "Delete");
      remove.type = "button";
      remove.addEventListener("click", () => deleteUpdate(update));

      actions.append(edit, remove);
      card.append(heading, meta, summary, actions);
      records.append(card);
    }
  }

  async function loadUpdates() {
    const { data, error } = await supabase
      .from("grove_updates")
      .select(
        "id,title,summary,body,category,status,published_at,created_at,updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    updates = data || [];
    renderUpdates();
  }

  function collectUpdate() {
    const title = fields.title.value.trim();
    const summary = fields.summary.value.trim();
    const body = fields.body.value.trim();
    const category = fields.category.value;
    const status = fields.status.value;

    if (title.length < 3 || title.length > 100) {
      throw new Error("The title must be between 3 and 100 characters.");
    }

    if (!summary || summary.length > 240) {
      throw new Error("Enter a summary of 240 characters or fewer.");
    }

    if (body.length > 12000) {
      throw new Error("Update details must be 12,000 characters or fewer.");
    }

    if (![
      "announcement",
      "release",
      "feature",
      "fix",
      "maintenance"
    ].includes(category)) {
      throw new Error("Choose a valid update category.");
    }

    if (!["draft", "published"].includes(status)) {
      throw new Error("Choose a valid publishing status.");
    }

    return {
      title,
      summary,
      body,
      category,
      status,
      published_at: status === "published"
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString()
    };
  }

  async function saveUpdate(event) {
    event.preventDefault();

    if (!isAdmin || saving) return;

    saving = true;
    saveButton.disabled = true;

    try {
      const values = collectUpdate();
      const editId = form.dataset.editId;

      showStatus("Saving update...");

      if (editId) {
        const { data, error } = await supabase
          .from("grove_updates")
          .update(values)
          .eq("id", editId)
          .select("id")
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          throw new Error("The update could not be changed.");
        }

      } else {
        const { error } = await supabase
          .from("grove_updates")
          .insert({
            ...values,
            created_by: user.id
          });

        if (error) throw error;
      }

      showStatus(
        values.status === "published"
          ? "Update published successfully."
          : "Draft saved successfully."
      );

      resetForm();
      await loadUpdates();

    } catch (error) {
      console.error("Grove update save failed:", error);

      showStatus(
        error.message || "Could not save the update.",
        true
      );

    } finally {
      saving = false;
      saveButton.disabled = false;
    }
  }

  async function initialize() {
    saveButton.disabled = true;

    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (!data.user) {
      window.location.replace("/login.html");
      return;
    }

    user = data.user;

    const { data: admin, error: adminError } = await supabase
      .from("grove_admins")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) throw adminError;

    isAdmin = ["owner", "admin"].includes(admin?.role);

    if (!isAdmin) {
      showStatus("You do not have permission to manage Grove updates.", true);
      return;
    }

    adminArea.hidden = false;
    saveButton.disabled = false;

    await loadUpdates();
  }

  form.addEventListener("submit", saveUpdate);
  resetButton.addEventListener("click", resetForm);

  initialize().catch(error => {
    console.error("Grove updates administration failed:", error);

    showStatus(
      error.message || "Could not open Updates Headquarters.",
      true
    );
  });
})();
