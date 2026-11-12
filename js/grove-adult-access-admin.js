import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const status = $("adult-admin-status");
  const list = $("adult-admin-list");
  const count = $("adult-admin-count");
  const refreshButton = $("adult-admin-refresh");

  let currentUser = null;
  let loading = false;

  function element(tag, className, text) {
    const item = document.createElement(tag);

    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;

    return item;
  }

  function setStatus(message, error = false) {
    status.textContent = message || "";
    status.classList.toggle("error", error);
  }

  function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function makeField(labelText, placeholder, defaultValue = "") {
    const label = element("label", "", labelText);
    const input = element("input");

    input.type = "text";
    input.maxLength = 160;
    input.placeholder = placeholder;
    input.value = defaultValue;

    label.append(input);

    return { label, input };
  }

  async function requireAdministrator() {
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    if (!auth.user) {
      window.location.replace("/login.html");
      return false;
    }

    currentUser = auth.user;

    const { data: admin, error } = await supabase
      .from("grove_admins")
      .select("role")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (!["owner", "admin"].includes(admin?.role)) {
      setStatus(
        "Administrator access is required to review these requests.",
        true
      );

      list.replaceChildren(
        element("p", "admin-empty", "Access denied.")
      );

      refreshButton.disabled = true;
      return false;
    }

    return true;
  }

  async function updateRequest(row, provider, reference, decision) {
    if (!currentUser) return;

    if (decision === "verified") {
      if (!provider.trim() || !reference.trim()) {
        setStatus(
          "Enter the verification provider and reference before approving.",
          true
        );
        return;
      }
    }

    const patch = {
      verification_status: decision,
      verification_provider:
        decision === "verified" ? provider.trim() : null,
      provider_reference:
        decision === "verified" ? reference.trim() : null,
      verified_at:
        decision === "verified"
          ? new Date().toISOString()
          : null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("grove_adult_access")
      .update(patch)
      .eq("user_id", row.user_id)
      .eq("verification_status", "pending")
      .select("user_id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "This request was already changed or is no longer pending."
      );
    }
  }

  function renderRequest(row, profile) {
    const card = element("article", "adult-request-card");

    const identity = element(
      "div",
      "adult-request-identity"
    );

    const displayName =
      profile?.display_name?.trim() ||
      (profile?.username ? `@${profile.username}` : "Grove member");

    identity.append(
      element("strong", "", displayName),
      element(
        "small",
        "",
        profile?.username
          ? `@${profile.username}`
          : "Username unavailable"
      ),
      element(
        "small",
        "",
        `Member ID: ${row.user_id}`
      )
    );

    const meta = element(
      "p",
      "adult-request-meta",
      `Submitted: ${formatDate(row.created_at)}`
    );

    const providerField = makeField(
      "Verification provider",
      "Example: manual review"
    );

    const referenceField = makeField(
      "Verification reference",
      "External provider reference or review ID"
    );

    const fields = element(
      "div",
      "adult-request-fields"
    );

    fields.append(
      providerField.label,
      referenceField.label
    );

    const actions = element(
      "div",
      "adult-request-actions"
    );

    const approve = element(
      "button",
      "approve",
      "Approve verified access"
    );
    approve.type = "button";

    const deny = element(
      "button",
      "deny",
      "Deny request"
    );
    deny.type = "button";

    approve.addEventListener("click", async () => {
      approve.disabled = true;
      deny.disabled = true;

      try {
        setStatus("Recording verification decision...");

        await updateRequest(
          row,
          providerField.input.value,
          referenceField.input.value,
          "verified"
        );

        setStatus("Adult access approved and recorded.");
        await loadRequests();

      } catch (error) {
        console.error("Adult access approval failed:", error);
        setStatus(
          error.message || "Could not approve this request.",
          true
        );

      } finally {
        approve.disabled = false;
        deny.disabled = false;
      }
    });

    deny.addEventListener("click", async () => {
      if (!window.confirm(
        "Deny this Adult access request?"
      )) {
        return;
      }

      approve.disabled = true;
      deny.disabled = true;

      try {
        setStatus("Recording review decision...");

        await updateRequest(
          row,
          "",
          "",
          "denied"
        );

        setStatus("Adult access request denied.");
        await loadRequests();

      } catch (error) {
        console.error("Adult access denial failed:", error);
        setStatus(
          error.message || "Could not deny this request.",
          true
        );

      } finally {
        approve.disabled = false;
        deny.disabled = false;
      }
    });

    actions.append(approve, deny);
    card.append(identity, meta, fields, actions);

    return card;
  }

  async function loadRequests() {
    if (loading) return;

    loading = true;
    refreshButton.disabled = true;

    try {
      setStatus("Loading pending requests...");
      list.replaceChildren(
        element("p", "admin-empty", "Loading...")
      );

      const { data: requests, error } = await supabase
        .from("grove_adult_access")
        .select(
          "user_id,verification_status,created_at"
        )
        .eq("verification_status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;

      const rows = requests || [];
      count.textContent = `${rows.length} pending request${rows.length === 1 ? "" : "s"}`;

      list.replaceChildren();

      if (!rows.length) {
        list.append(
          element(
            "p",
            "admin-empty",
            "No pending Adult access requests."
          )
        );

        setStatus("Review queue is up to date.");
        return;
      }

      const ids = rows.map(row => row.user_id);

      const { data: profiles, error: profileError } =
        await supabase
          .from("profile_directory")
          .select("id,username,display_name")
          .in("id", ids);

      if (profileError) {
        console.warn(
          "Adult review profile names could not load:",
          profileError
        );
      }

      const profileMap = new Map(
        (profiles || []).map(profile => [
          profile.id,
          profile
        ])
      );

      for (const row of rows) {
        list.append(
          renderRequest(row, profileMap.get(row.user_id))
        );
      }

      setStatus("Pending requests loaded.");

    } catch (error) {
      console.error("Adult access queue failed:", error);

      setStatus(
        error.message || "Could not load the review queue.",
        true
      );

      list.replaceChildren(
        element(
          "p",
          "admin-empty",
          "The review queue could not be loaded."
        )
      );

    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  }

  async function initialize() {
    try {
      refreshButton.addEventListener("click", loadRequests);

      const allowed = await requireAdministrator();

      if (!allowed) return;

      await loadRequests();

    } catch (error) {
      console.error("Adult access administration failed:", error);

      setStatus(
        error.message || "Could not initialize the review page.",
        true
      );
    }
  }

  initialize();
})();
