import { supabase } from "./supabase.js";
import { GROVE_OWNER_ID } from "./config.js";

import {
  listProjects,
  listTasks,
  listNotes,
  listPlans
} from "./workspace.js";

const $ = (id) => document.getElementById(id);

function showMessage(message) {
  const status = $("overview-status");
  if (status) status.textContent = message;
}

function showCount(id, value) {
  const target = $(id);
  if (target) target.textContent = String(value);
}

async function loadOverview() {
  showMessage("Loading Grove workspace...");

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || data.user.id !== GROVE_OWNER_ID) {
    showMessage("Owner authentication could not be verified.");
    return;
  }

  try {
    const [projects, tasks, notes, plans] = await Promise.all([
      listProjects(),
      listTasks(),
      listNotes(),
      listPlans()
    ]);

    showCount("overview-project-total", projects.length);
    showCount(
      "overview-project-active",
      projects.filter((item) => item.status === "active").length
    );

    showCount("overview-task-total", tasks.length);
    showCount(
      "overview-task-progress",
      tasks.filter((item) => item.status === "in_progress").length
    );
    showCount(
      "overview-task-done",
      tasks.filter((item) => item.status === "done").length
    );

    showCount("overview-note-total", notes.length);
    showCount(
      "overview-note-archived",
      notes.filter((item) => item.is_archived).length
    );

    showCount("overview-plan-total", plans.length);
    showCount(
      "overview-plan-active",
      plans.filter((item) => item.status === "active").length
    );

    showMessage("Workspace data loaded.");
  } catch (error) {
    console.error("Grove Overview:", error);

    showMessage(
      `Workspace data could not be loaded: ${error.message}`
    );
  }
}

const refreshButton = $("overview-refresh");

if (refreshButton) {
  refreshButton.addEventListener("click", loadOverview);
}

await loadOverview();
