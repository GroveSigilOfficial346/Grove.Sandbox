import { supabase } from "./supabase.js";
import {
  GROVE_ENVIRONMENT,
  GROVE_OWNER_ID
} from "./config.js";
import { installInactivityLock } from "./session-lock.js";

import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan
} from "./workspace.js";

const $ = (id) => document.getElementById(id);

const sectionConfig = {
  projects: {
    list: listProjects,
    create: createProject,
    update: updateProject,
    remove: deleteProject,
    fields: [
      { name: "title", label: "Project title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["active", "paused", "completed", "archived"]
      },
      { name: "sort_order", label: "Display order", type: "number" }
    ]
  },

  tasks: {
    list: listTasks,
    create: createTask,
    update: updateTask,
    remove: deleteTask,
    fields: [
      { name: "title", label: "Task title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "project_id", label: "Project", type: "project" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["todo", "in_progress", "done", "archived"]
      },
      {
        name: "priority",
        label: "Priority",
        type: "select",
        options: [
          { value: "1", label: "Low" },
          { value: "2", label: "Normal" },
          { value: "3", label: "High" }
        ]
      },
      { name: "due_date", label: "Due date", type: "date" },
      { name: "sort_order", label: "Display order", type: "number" }
    ]
  },

  notes: {
    list: listNotes,
    create: createNote,
    update: updateNote,
    remove: deleteNote,
    fields: [
      { name: "title", label: "Note title", type: "text" },
      { name: "content", label: "Content", type: "textarea" },
      { name: "tags", label: "Tags (separate with commas)", type: "text" },
      { name: "is_archived", label: "Archived", type: "checkbox" }
    ]
  },

  planning: {
    list: listPlans,
    create: createPlan,
    update: updatePlan,
    remove: deletePlan,
    fields: [
      { name: "title", label: "Plan title", type: "text", required: true },
      { name: "details", label: "Details", type: "textarea" },
      { name: "starts_at", label: "Starts", type: "datetime-local" },
      { name: "ends_at", label: "Ends", type: "datetime-local" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["planned", "active", "completed", "cancelled"]
      }
    ]
  }
};

const style = document.createElement("style");

style.textContent = `
  .workspace-panel {
    margin-top: 30px;
  }

  .workspace-form {
    display: grid;
    gap: 14px;
    max-width: 650px;
    padding: 22px;
    border: 1px solid #242424;
    background: #080808;
  }

  .workspace-field {
    display: grid;
    gap: 7px;
  }

  .workspace-field label {
    color: #999;
    font-size: 11px;
    letter-spacing: 1px;
  }

  .workspace-field input,
  .workspace-field textarea,
  .workspace-field select {
    width: 100%;
    padding: 11px;
    border: 1px solid #303030;
    border-radius: 0;
    background: #050505;
    color: #eee;
    font: inherit;
    font-size: 13px;
  }

  .workspace-field textarea {
    min-height: 100px;
    resize: vertical;
  }

  .workspace-field input[type="checkbox"] {
    width: auto;
    accent-color: #ddd;
  }

  .workspace-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 8px;
  }

  .workspace-button {
    padding: 10px 14px;
    border: 1px solid #383838;
    background: #111;
    color: #eee;
    font-size: 11px;
    cursor: pointer;
  }

  .workspace-button:hover {
    background: #222;
  }

  .workspace-list {
    display: grid;
    gap: 12px;
    max-width: 800px;
    margin-top: 24px;
  }

  .workspace-record {
    padding: 18px;
    border: 1px solid #242424;
    background: #080808;
  }

  .workspace-record h2 {
    margin: 0 0 9px;
    font-size: 14px;
    font-weight: 400;
  }

  .workspace-record p {
    margin: 7px 0;
    color: #888;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .workspace-meta {
    color: #666 !important;
    font-size: 10px !important;
    letter-spacing: 1px;
  }

  .workspace-message {
    min-height: 18px;
    color: #999;
    font-size: 12px;
    line-height: 1.6;
  }

  .workspace-empty {
    padding: 20px;
    border: 1px solid #242424;
    color: #777;
    font-size: 12px;
  }

  @media (max-width: 700px) {
    .workspace-form {
      padding: 16px;
    }
  }
`;

document.head.appendChild(style);

function returnToLogin() {
  window.location.replace("/admin/");
}

installInactivityLock(supabase, {
  timeoutMs: 15 * 60 * 1000,
  onLock: returnToLogin
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    returnToLogin();
  }
});

const { data, error } = await supabase.auth.getUser();

if (
  error ||
  !data.user ||
  data.user.id !== GROVE_OWNER_ID
) {
  await supabase.auth.signOut({ scope: "local" });
  returnToLogin();
} else {
  $("environment").textContent = GROVE_ENVIRONMENT;
  document.body.hidden = false;
}

function element(tag, className, text) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  return node;
}

function makeButton(label, action) {
  const button = element("button", "workspace-button", label);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}

function dateForInput(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function displayDate(value) {
  if (!value) return "Not scheduled";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function createField(definition, value, projects) {
  const wrapper = element("div", "workspace-field");
  const label = element("label", "", definition.label);

  let control;

  if (definition.type === "textarea") {
    control = document.createElement("textarea");
    control.value = value ?? "";
  } else if (definition.type === "select") {
    control = document.createElement("select");

    for (const option of definition.options) {
      const optionValue =
        typeof option === "string" ? option : option.value;

      const optionLabel =
        typeof option === "string" ? option : option.label;

      const item = element("option", "", optionLabel);
      item.value = optionValue;
      control.appendChild(item);
    }

    const firstOption = definition.options[0];
    const defaultValue =
      typeof firstOption === "string"
        ? firstOption
        : firstOption.value;

    control.value = value ?? defaultValue;
  } else if (definition.type === "project") {
    control = document.createElement("select");

    const empty = element("option", "", "No project");
    empty.value = "";
    control.appendChild(empty);

    for (const project of projects) {
      const option = element("option", "", project.title);
      option.value = project.id;
      control.appendChild(option);
    }

    control.value = value ?? "";
  } else if (definition.type === "checkbox") {
    control = document.createElement("input");
    control.type = "checkbox";
    control.checked = Boolean(value);
  } else {
    control = document.createElement("input");
    control.type = definition.type;
    control.value = value ?? "";
  }

  control.name = definition.name;

  if (definition.required) {
    control.required = true;
  }

  label.htmlFor = `grove-${definition.name}`;
  control.id = `grove-${definition.name}`;

  wrapper.append(label, control);

  return wrapper;
}

function readForm(form, definitions) {
  const payload = {};

  for (const definition of definitions) {
    const control = form.elements.namedItem(definition.name);

    if (!control) continue;

    let value;

    if (definition.type === "checkbox") {
      value = control.checked;
    } else {
      value = control.value.trim();
    }

    if (definition.type === "number") {
      value = value === "" ? 0 : Number(value);

      if (!Number.isFinite(value)) {
        throw new Error(`${definition.label} must be a valid number.`);
      }
    }

    if (definition.type === "project") {
      value = value || null;
    }

    if (definition.name === "tags") {
      value = value
        ? value.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [];
    }

    if (definition.type === "datetime-local") {
      value = value ? new Date(value).toISOString() : null;
    }

    if (definition.name === "due_date") {
      value = value || null;
    }

    payload[definition.name] = value;
  }

  if (definitions.some((field) => field.name === "due_date")) {
    payload.completed_at =
      payload.status === "done"
        ? new Date().toISOString()
        : null;
  }

  return payload;
}

function recordDescription(section, record) {
  if (section === "projects") {
    return [
      record.description,
      `Status: ${record.status}`
    ].filter(Boolean);
  }

  if (section === "tasks") {
    return [
      record.description,
      `Status: ${record.status}`,
      `Priority: ${record.priority === 3 ? "High" : record.priority === 1 ? "Low" : "Normal"}`,
      record.due_date ? `Due: ${record.due_date}` : "No due date"
    ].filter(Boolean);
  }

  if (section === "notes") {
    return [
      record.content,
      record.tags?.length ? `Tags: ${record.tags.join(", ")}` : "",
      record.is_archived ? "Archived" : "Active"
    ].filter(Boolean);
  }

  return [
    record.details,
    `Status: ${record.status}`,
    `Starts: ${displayDate(record.starts_at)}`,
    `Ends: ${displayDate(record.ends_at)}`
  ].filter(Boolean);
}

async function setupWorkspace(section) {
  const config = sectionConfig[section];
  const view = document.querySelector(`[data-view="${section}"]`);

  if (!config || !view || view.dataset.workspaceReady === "true") {
    return;
  }

  view.dataset.workspaceReady = "true";

  const oldPlaceholder = view.querySelector(".coming");
  if (oldPlaceholder) oldPlaceholder.remove();

  const panel = element("div", "workspace-panel");
  const form = element("form", "workspace-form");
  const formHeading = element("h2", "", "Create new record");
  const message = element("p", "workspace-message");
  const list = element("div", "workspace-list");

  let editingId = null;
  let projects = [];

  form.appendChild(formHeading);

  if (section === "tasks") {
    try {
      projects = await listProjects();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  for (const definition of config.fields) {
    form.appendChild(createField(definition, null, projects));
  }

  const actions = element("div", "workspace-actions");
  const submit = element("button", "workspace-button", "Save");
  submit.type = "submit";

  const cancel = makeButton("Cancel edit", () => {
    editingId = null;
    form.reset();
    formHeading.textContent = "Create new record";
    submit.textContent = "Save";
    cancel.hidden = true;
    message.textContent = "";
  });

  cancel.hidden = true;
  actions.append(submit, cancel);
  form.append(actions, message);

  async function refresh() {
    list.replaceChildren();

    try {
      const records = await config.list();

      if (!records.length) {
        list.appendChild(
          element(
            "div",
            "workspace-empty",
            "No records yet. Create your first one above."
          )
        );
        return;
      }

      for (const record of records) {
        const card = element("article", "workspace-record");
        const title = element(
          "h2",
          "",
          record.title || "Untitled"
        );

        card.appendChild(title);

        for (const line of recordDescription(section, record)) {
          card.appendChild(element("p", "", line));
        }

        const recordActions = element("div", "workspace-actions");

        recordActions.appendChild(
          makeButton("Edit", () => {
            editingId = record.id;
            formHeading.textContent = "Edit record";
            submit.textContent = "Update";
            cancel.hidden = false;
            message.textContent = "";

            for (const definition of config.fields) {
              const control = form.elements.namedItem(definition.name);
              if (!control) continue;

              const value = record[definition.name];

              if (definition.type === "checkbox") {
                control.checked = Boolean(value);
              } else if (definition.name === "tags") {
                control.value = Array.isArray(value) ? value.join(", ") : "";
              } else if (definition.type === "datetime-local") {
                control.value = dateForInput(value);
              } else {
                control.value = value ?? "";
              }
            }

            form.scrollIntoView({ behavior: "smooth", block: "start" });
          })
        );

        recordActions.appendChild(
          makeButton("Delete", async () => {
            if (!window.confirm("Delete this record permanently?")) {
              return;
            }

            try {
              await config.remove(record.id);
              message.textContent = "Record deleted.";
              await refresh();
            } catch (error) {
              message.textContent = error.message;
            }
          })
        );

        card.appendChild(recordActions);
        list.appendChild(card);
      }
    } catch (error) {
      list.appendChild(
        element(
          "div",
          "workspace-empty",
          `Unable to load records: ${error.message}`
        )
      );
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    message.textContent = "Saving...";

    try {
      const payload = readForm(form, config.fields);

      if (editingId) {
        await config.update(editingId, payload);
        message.textContent = "Record updated.";
      } else {
        await config.create(payload);
        message.textContent = "Record created.";
      }

      const selectedProjectId = section === "tasks"
        ? form.elements.namedItem("project_id")?.value ?? ""
        : "";

      editingId = null;
      form.reset();
      formHeading.textContent = "Create new record";
      submit.textContent = "Save";
      cancel.hidden = true;

      if (section === "tasks") {
        projects = await listProjects();
        const projectField = form.elements.namedItem("project_id");

        if (projectField) {
          const replacement = createField(
            config.fields.find((field) => field.name === "project_id"),
            selectedProjectId,
            projects
          );

          projectField.parentElement.replaceWith(replacement);
        }
      }

      await refresh();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  panel.append(form, list);
  view.appendChild(panel);

  await refresh();
}

const navigation = document.querySelectorAll("[data-section]");
const views = document.querySelectorAll("[data-view]");

for (const button of navigation) {
  button.addEventListener("click", async () => {
    const selected = button.dataset.section;

    for (const item of navigation) {
      item.classList.toggle("active", item === button);
    }

    for (const view of views) {
      view.hidden = view.dataset.view !== selected;
    }

    if (sectionConfig[selected]) {
      await setupWorkspace(selected);
    }
  });
}

$("signout-button").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  returnToLogin();
});
