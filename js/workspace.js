import { supabase } from "./supabase.js";
import { GROVE_OWNER_ID } from "./config.js";

/*
 * GROVE WORKSPACE DATA LAYER
 * Shared by Main and Sandbox.
 *
 * Tables:
 * - grove_projects
 * - grove_tasks
 * - grove_notes
 * - grove_plans
 *
 * Security:
 * - Requires an authenticated owner account.
 * - Never accepts owner_id from user input.
 * - Supabase RLS remains the database security boundary.
 */

const TABLES = {
  projects: {
    name: "grove_projects",
    fields: [
      "title",
      "description",
      "status",
      "sort_order"
    ],
    order: ["sort_order", "created_at"]
  },

  tasks: {
    name: "grove_tasks",
    fields: [
      "project_id",
      "title",
      "description",
      "status",
      "priority",
      "due_date",
      "completed_at",
      "sort_order"
    ],
    order: ["sort_order", "created_at"]
  },

  notes: {
    name: "grove_notes",
    fields: [
      "title",
      "content",
      "tags",
      "is_archived"
    ],
    order: ["updated_at"]
  },

  plans: {
    name: "grove_plans",
    fields: [
      "title",
      "details",
      "starts_at",
      "ends_at",
      "status"
    ],
    order: ["starts_at"]
  }
};

function assertValidId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("A valid record ID is required.");
  }

  return id.trim();
}

async function requireOwner() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  const user = data?.user;

  if (!user) {
    throw new Error("You must be signed in to use Grove.");
  }

  if (user.id !== GROVE_OWNER_ID) {
    await supabase.auth.signOut({ scope: "local" });
    throw new Error("This account is not authorized to access Grove.");
  }

  return user;
}

function cleanPayload(type, payload) {
  const config = TABLES[type];

  if (!config) {
    throw new Error("Unknown Grove workspace section.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("A valid record object is required.");
  }

  const cleaned = {};

  for (const field of config.fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      cleaned[field] = payload[field];
    }
  }

  return cleaned;
}

async function listRecords(type) {
  await requireOwner();

  const config = TABLES[type];

  if (!config) {
    throw new Error("Unknown Grove workspace section.");
  }

  let query = supabase
    .from(config.name)
    .select("*");

  for (const field of config.order) {
    query = query.order(field, {
      ascending: field !== "updated_at",
      nullsFirst: false
    });
  }

  const { data, error } = await query;

  if (error) throw error;

  return data ?? [];
}

async function getRecord(type, id) {
  await requireOwner();

  const config = TABLES[type];

  if (!config) {
    throw new Error("Unknown Grove workspace section.");
  }

  const { data, error } = await supabase
    .from(config.name)
    .select("*")
    .eq("id", assertValidId(id))
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function createRecord(type, payload) {
  await requireOwner();

  const config = TABLES[type];

  if (!config) {
    throw new Error("Unknown Grove workspace section.");
  }

  const cleaned = cleanPayload(type, payload);

  if (!Object.keys(cleaned).length) {
    throw new Error("No valid record fields were provided.");
  }

  const { data, error } = await supabase
    .from(config.name)
    .insert(cleaned)
    .select("*")
    .single();

  if (error) throw error;

  return data;
}

async function updateRecord(type, id, payload) {
  await requireOwner();

  const config = TABLES[type];

  if (!config) {
    throw new Error("Unknown Grove workspace section.");
  }

  const cleaned = cleanPayload(type, payload);

  if (!Object.keys(cleaned).length) {
    throw new Error("No valid fields were provided for updating.");
  }

  cleaned.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from(config.name)
    .update(cleaned)
    .eq("id", assertValidId(id))
    .select("*")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("Record not found or access denied.");
  }

  return data;
}

async function deleteRecord(type, id) {
  await requireOwner();

  const config = TABLES[type];

  if (!config) {
    throw new Error("Unknown Grove workspace section.");
  }

  const { data, error } = await supabase
    .from(config.name)
    .delete()
    .eq("id", assertValidId(id))
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("Record not found or access denied.");
  }

  return true;
}

/* PROJECTS */

export const listProjects = () =>
  listRecords("projects");

export const getProject = (id) =>
  getRecord("projects", id);

export const createProject = (payload) =>
  createRecord("projects", payload);

export const updateProject = (id, payload) =>
  updateRecord("projects", id, payload);

export const deleteProject = (id) =>
  deleteRecord("projects", id);

/* TASKS */

export const listTasks = () =>
  listRecords("tasks");

export const getTask = (id) =>
  getRecord("tasks", id);

export const createTask = (payload) =>
  createRecord("tasks", payload);

export const updateTask = (id, payload) =>
  updateRecord("tasks", id, payload);

export const deleteTask = (id) =>
  deleteRecord("tasks", id);

/* NOTES & ARCHIVE */

export const listNotes = () =>
  listRecords("notes");

export const getNote = (id) =>
  getRecord("notes", id);

export const createNote = (payload) =>
  createRecord("notes", payload);

export const updateNote = (id, payload) =>
  updateRecord("notes", id, payload);

export const deleteNote = (id) =>
  deleteRecord("notes", id);

/* PLANNING */

export const listPlans = () =>
  listRecords("plans");

export const getPlan = (id) =>
  getRecord("plans", id);

export const createPlan = (payload) =>
  createRecord("plans", payload);

export const updatePlan = (id, payload) =>
  updateRecord("plans", id, payload);

export const deletePlan = (id) =>
  deleteRecord("plans", id);
