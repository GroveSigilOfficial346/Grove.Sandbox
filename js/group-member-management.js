export function installGroupMemberManagement(client) {
  "use strict";

  const supabase = client;

  if (!supabase) {
    console.error("Grove group management: Supabase client is missing.");
    return;
  }

  const sidebar = document.querySelector(".conversation-sidebar");
  const chatHeading = document.querySelector(".chat-heading");

  if (!sidebar || !chatHeading) return;
  if (window.__groveGroupManagementInstalled) return;

  window.__groveGroupManagementInstalled = true;

  let currentUser = null;
  let activeConversationId = null;
  let activeConversationToken = 0;
  let loading = false;

  const overlay = document.createElement("div");
  overlay.id = "grove-member-management-overlay";
  overlay.className = "grove-member-management-overlay";
  overlay.hidden = true;

  overlay.innerHTML = `
    <section
      class="grove-member-management-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grove-member-management-title"
    >
      <header class="grove-member-management-header">
        <div>
          <span class="grove-group-eyebrow">GROUP SETTINGS</span>
          <h2 id="grove-member-management-title">Group members</h2>
          <p id="grove-member-management-subtitle"></p>
        </div>

        <button
          type="button"
          class="grove-member-management-close"
          aria-label="Close member list"
        >×</button>
      </header>

      <p
        id="grove-member-management-status"
        role="status"
        aria-live="polite"
      ></p>

      <div
        id="grove-member-management-list"
        class="grove-member-management-list"
      ></div>

      <footer class="grove-member-management-footer">
        <button
          type="button"
          class="grove-member-management-done"
        >Done</button>
      </footer>
    </section>
  `;

  document.body.append(overlay);

  const closeButton = overlay.querySelector(
    ".grove-member-management-close"
  );

  const doneButton = overlay.querySelector(
    ".grove-member-management-done"
  );

  const list = overlay.querySelector(
    "#grove-member-management-list"
  );

  const status = overlay.querySelector(
    "#grove-member-management-status"
  );

  const subtitle = overlay.querySelector(
    "#grove-member-management-subtitle"
  );

  function setStatus(message, error = false) {
    status.textContent = message || "";
    status.classList.toggle("is-error", error);
  }

  function closeDialog() {
    overlay.hidden = true;
    document.body.classList.remove("grove-member-management-open");
  }

  function openDialog() {
    if (!activeConversationId) return;

    overlay.hidden = false;
    document.body.classList.add("grove-member-management-open");

    loadMembers(activeConversationId).catch(error => {
      console.error("Grove group members could not load:", error);
      setStatus(
        error.message || "Could not load group members.",
        true
      );
    });

    closeButton.focus();
  }

  function makeElement(tag, className, value) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;

    return element;
  }

  function roleLabel(role, isCreator) {
    if (isCreator) return "Group creator";

    if (role === "owner") return "Owner";
    if (role === "admin") return "Admin";

    return "Member";
  }

  function memberName(profile) {
    return (
      profile?.display_name?.trim() ||
      (profile?.username ? `@${profile.username}` : "Grove member")
    );
  }

  function createMemberCard(member, profile, conversation, canManage) {
    const card = makeElement("article", "grove-member-card");
    const identity = makeElement("div", "grove-member-identity");
    const avatar = makeElement("div", "grove-member-avatar");

    if (profile?.avatar_url) {
      const image = document.createElement("img");
      image.src = profile.avatar_url;
      image.alt = "";
      image.loading = "lazy";
      avatar.append(image);
    } else {
      avatar.textContent = "G";
    }

    const details = makeElement("div", "grove-member-details");

    details.append(
      makeElement("strong", "grove-member-name", memberName(profile)),
      makeElement(
        "span",
        "grove-member-username",
        profile?.username ? `@${profile.username}` : ""
      )
    );

    identity.append(avatar, details);

    const isCreator = member.user_id === conversation.created_by;

    const role = makeElement(
      "span",
      `grove-member-role grove-member-role-${member.role}`,
      roleLabel(member.role, isCreator)
    );

    const actions = makeElement("div", "grove-member-actions");

    const removable =
      canManage &&
      member.role === "member" &&
      !isCreator &&
      member.user_id !== currentUser.id;

    if (removable) {
      const removeButton = makeElement(
        "button",
        "grove-member-remove",
        "Remove"
      );

      removeButton.type = "button";

      removeButton.addEventListener("click", () => {
        removeMember(member, profile, conversation);
      });

      actions.append(removeButton);
    }

    card.append(identity, role, actions);

    return card;
  }

  async function loadMembers(conversationId) {
    if (!currentUser || !conversationId || loading) return;

    loading = true;
    const token = ++activeConversationToken;

    list.replaceChildren();
    setStatus("Loading group members...");

    try {
      const { data: conversation, error: conversationError } =
        await supabase
          .from("conversations")
          .select("id,conversation_type,title,created_by")
          .eq("id", conversationId)
          .maybeSingle();

      if (conversationError) throw conversationError;

      if (!conversation || conversation.conversation_type !== "group") {
        throw new Error("This group is no longer available.");
      }

      const { data: members, error: memberError } =
        await supabase
          .from("conversation_members")
          .select("conversation_id,user_id,role,joined_at")
          .eq("conversation_id", conversationId)
          .order("joined_at", { ascending: true });

      if (memberError) throw memberError;

      if (token !== activeConversationToken) return;

      const currentMembership = (members || []).find(
        member => member.user_id === currentUser.id
      );

      if (!currentMembership) {
        throw new Error("You are no longer a member of this group.");
      }

      const canManage = ["owner", "admin"].includes(
        currentMembership.role
      );

      const ids = (members || []).map(member => member.user_id);

      const { data: profiles, error: profileError } =
        await supabase
          .from("profile_directory")
          .select("id,username,display_name,avatar_url")
          .in("id", ids);

      if (profileError) throw profileError;

      if (token !== activeConversationToken) return;

      const profileMap = new Map(
        (profiles || []).map(profile => [profile.id, profile])
      );

      list.replaceChildren();

      for (const member of members || []) {
        list.append(
          createMemberCard(
            member,
            profileMap.get(member.user_id),
            conversation,
            canManage
          )
        );
      }

      subtitle.textContent =
        `${members?.length || 0} members · ${conversation.title || "Grove group"}`;

      setStatus(
        canManage
          ? "You can remove ordinary members. Owners and admins are protected."
          : "You can view the group roster."
      );

    } finally {
      loading = false;
    }
  }

  async function removeMember(member, profile, conversation) {
    const name = memberName(profile);

    const confirmed = window.confirm(
      `Remove ${name} from this group? They will lose access to this conversation.`
    );

    if (!confirmed) return;

    const button = [...list.querySelectorAll(".grove-member-remove")]
      .find(item =>
        item.closest(".grove-member-card")
          ?.querySelector(".grove-member-name")
          ?.textContent === name
      );

    if (button) {
      button.disabled = true;
      button.textContent = "Removing...";
    }

    setStatus(`Removing ${name}...`);

    try {
      const { data, error } = await supabase
        .from("conversation_members")
        .delete()
        .eq("conversation_id", conversation.id)
        .eq("user_id", member.user_id)
        .select("user_id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "The member was not removed. Your account may not have permission."
        );
      }

      setStatus(`${name} was removed from the group.`);
      await loadMembers(conversation.id);

    } catch (error) {
      console.error("Grove group member removal failed:", error);

      setStatus(
        error.message || "Could not remove this member.",
        true
      );

      if (button) {
        button.disabled = false;
        button.textContent = "Remove";
      }
    }
  }

  function addManagementButton() {
    if (chatHeading.querySelector(".grove-manage-members-button")) return;

    const button = document.createElement("button");

    button.type = "button";
    button.className = "grove-manage-members-button";
    button.textContent = "Members";
    button.hidden = true;

    button.addEventListener("click", openDialog);
    chatHeading.append(button);
  }

  async function inspectConversation(conversationId) {
    if (!conversationId || !currentUser) return;

    activeConversationId = conversationId;

    const token = ++activeConversationToken;
    const button = chatHeading.querySelector(
      ".grove-manage-members-button"
    );

    if (button) button.hidden = true;

    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id,conversation_type")
        .eq("id", conversationId)
        .maybeSingle();

      if (error) throw error;
      if (token !== activeConversationToken) return;

      if (button) {
        button.hidden = data?.conversation_type !== "group";
      }

    } catch (error) {
      console.warn("Grove group details unavailable:", error);
    }
  }

  document.addEventListener("click", event => {
    const conversationButton = event.target.closest(
      ".conversation-item[data-conversation-id]"
    );

    if (!conversationButton) return;

    const conversationId = conversationButton.dataset.conversationId;

    window.setTimeout(() => {
      inspectConversation(conversationId);
    }, 0);
  });

  closeButton.addEventListener("click", closeDialog);
  doneButton.addEventListener("click", closeDialog);

  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeDialog();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeDialog();
    }
  });

  async function initialize() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    currentUser = data.user;

    if (!currentUser) return;

    addManagementButton();

    const requestedConversation =
      new URLSearchParams(location.search).get("conversation");

    if (requestedConversation) {
      inspectConversation(requestedConversation);
    }
  }

  initialize().catch(error => {
    console.error(
      "Grove group management could not initialize:",
      error
    );
  });
}
