import { supabase } from "./supabase.js";

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);

  const state = {
    user: null,
    channels: [],
    memberships: new Map(),
    invites: [],
    activeChannel: null,
    searchTimer: null,
    memberSearchTimer: null,
    loading: false
  };

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);

  function status(message, isError = false) {
    const node = $("#broadcast-status");
    if (!node) return;

    node.textContent = message || "";
    node.classList.toggle("is-error", isError);
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog) dialog.hidden = true;
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog) dialog.hidden = false;
  }

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    state.user = data.user || null;

    if (!state.user) {
      window.location.href = "/login.html";
      throw new Error("Please sign in to use broadcast channels.");
    }
  }

  async function loadMemberships() {
    const { data, error } = await supabase
      .from("channel_members")
      .select("channel_id,role")
      .eq("user_id", state.user.id);

    if (error) throw error;

    state.memberships = new Map(
      (data || []).map(row => [row.channel_id, row.role])
    );
  }

  async function loadChannels() {
    await loadMemberships();

    const [publicResult, ownedResult] = await Promise.all([
      supabase
        .from("broadcast_channels")
        .select("id,owner_id,name,description,avatar_url,is_private,created_at")
        .eq("is_private", false)
        .order("created_at", { ascending: false }),

      supabase
        .from("broadcast_channels")
        .select("id,owner_id,name,description,avatar_url,is_private,created_at")
        .eq("owner_id", state.user.id)
        .order("created_at", { ascending: false })
    ]);

    if (publicResult.error) throw publicResult.error;
    if (ownedResult.error) throw ownedResult.error;

    const unique = new Map();

    for (const channel of [
      ...(publicResult.data || []),
      ...(ownedResult.data || [])
    ]) {
      unique.set(channel.id, channel);
    }

    // Members must also be able to see private channels they joined.
    const memberChannelIds = [...state.memberships.keys()];

    if (memberChannelIds.length) {
      const { data: memberChannels, error: memberChannelsError } =
        await supabase
          .from("broadcast_channels")
          .select("id,owner_id,name,description,avatar_url,is_private,created_at")
          .in("id", memberChannelIds)
          .order("created_at", { ascending: false });

      if (memberChannelsError) throw memberChannelsError;

      for (const channel of memberChannels || []) {
        unique.set(channel.id, channel);
      }
    }

    state.channels = [...unique.values()];
    renderChannels();
  }

  async function ensureMembership(channelId) {
    if (!channelId || !state.user?.id) {
      throw new Error("Missing channel or account information.");
    }

    const existingRole = state.memberships.get(channelId);

    if (existingRole) return existingRole;

    const { error } = await supabase
      .from("channel_members")
      .insert({
        channel_id: channelId,
        user_id: state.user.id,
        role: "subscriber"
      });

    if (error && error.code !== "23505") {
      throw error;
    }

    // A duplicate can mean a previous attempt already succeeded.
    const { data, error: verifyError } = await supabase
      .from("channel_members")
      .select("channel_id,role")
      .eq("channel_id", channelId)
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (verifyError) throw verifyError;

    if (!data) {
      throw new Error(
        "The invitation was accepted, but channel membership could not be confirmed. Check the invitation policy and try refreshing."
      );
    }

    state.memberships.set(channelId, data.role);
    return data.role;
  }

  async function reconcileAcceptedInvites() {
    const { data, error } = await supabase
      .from("channel_invites")
      .select("id,channel_id,status")
      .eq("invitee_id", state.user.id)
      .eq("status", "accepted");

    if (error) throw error;

    let repaired = 0;
    const failures = [];

    for (const invite of data || []) {
      if (state.memberships.has(invite.channel_id)) continue;

      try {
        await ensureMembership(invite.channel_id);
        repaired++;
      } catch (membershipError) {
        console.warn(
          "Accepted broadcast invitation still needs membership:",
          invite.channel_id,
          membershipError
        );
        failures.push(invite.channel_id);
      }
    }

    return { repaired, failures };
  }

  function renderChannels() {
    const list = $("#channel-list");
    const search = $("#channel-search");
    if (!list) return;

    const term = search?.value.trim().toLowerCase() || "";

    const channels = state.channels.filter(channel => {
      const text =
        `${channel.name} ${channel.description || ""}`.toLowerCase();

      return text.includes(term);
    });

    if (!channels.length) {
      list.innerHTML = `
        <p class="broadcast-muted">
          ${term
            ? "No matching channels."
            : "No channels yet. Create one to get started."}
        </p>
      `;
      return;
    }

    list.innerHTML = "";

    for (const channel of channels) {
      const button = document.createElement("button");
      const role = state.memberships.get(channel.id);
      const isOwner = channel.owner_id === state.user.id;

      button.type = "button";
      button.className = "broadcast-channel-item";
      button.classList.toggle(
        "active",
        state.activeChannel?.id === channel.id
      );

      button.innerHTML = `
        <span class="broadcast-channel-symbol">◉</span>
        <span class="broadcast-channel-copy">
          <strong>${escapeHTML(channel.name)}</strong>
          <small>
            ${isOwner ? "Your channel" : role || "Public channel"}
            ${channel.is_private ? " · Private" : ""}
          </small>
        </span>
      `;

      button.addEventListener("click", () => openChannel(channel));
      list.append(button);
    }
  }

  async function loadInvites() {
    const { data, error } = await supabase
      .from("channel_invites")
      .select("id,channel_id,inviter_id,created_at,status")
      .eq("invitee_id", state.user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    state.invites = data || [];
    renderInvites();
  }

  function renderInvites() {
    const section = $("#invite-section");
    const list = $("#invite-list");

    if (!section || !list) return;

    section.hidden = state.invites.length === 0;
    list.innerHTML = "";

    for (const invite of state.invites) {
      const row = document.createElement("div");
      row.className = "broadcast-invite-row";

      const copy = document.createElement("div");
      copy.innerHTML = `
        <strong>Private channel invitation</strong>
        <div class="broadcast-muted">
          Channel reference: ${escapeHTML(invite.channel_id.slice(0, 8))}…
          · ${escapeHTML(formatDate(invite.created_at))}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "broadcast-invite-actions";

      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "broadcast-primary";
      accept.textContent = "Accept";
      accept.addEventListener("click", () =>
        respondToInvite(invite, "accepted")
      );

      const decline = document.createElement("button");
      decline.type = "button";
      decline.className = "broadcast-secondary";
      decline.textContent = "Decline";
      decline.addEventListener("click", () =>
        respondToInvite(invite, "declined")
      );

      actions.append(accept, decline);
      row.append(copy, actions);
      list.append(row);
    }
  }

  async function respondToInvite(invite, response) {
    try {
      status("Updating invitation...");

      const { data, error } = await supabase
        .from("channel_invites")
        .update({
          status: response,
          updated_at: new Date().toISOString()
        })
        .eq("id", invite.id)
        .eq("invitee_id", state.user.id)
        .eq("status", "pending")
        .select("id,status,channel_id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("This invitation is no longer pending.");
      }

      if (response === "accepted") {
        // The SQL policy must be installed before this insert can succeed.
        await ensureMembership(invite.channel_id);

        await Promise.all([
          loadChannels(),
          loadInvites()
        ]);

        const joinedChannel = state.channels.find(
          channel => channel.id === invite.channel_id
        );

        if (joinedChannel) {
          await openChannel(joinedChannel);
        }

        status("Invitation accepted. You have joined the private channel.");
      } else {
        await loadInvites();
        status("Invitation declined.");
      }

    } catch (error) {
      console.error("Grove channel invitation response failed:", error);

      status(
        error.message ||
        "Could not complete the invitation. Refresh and try again.",
        true
      );
    }
  }

  function renderPosts(posts) {
    const container = $("#channel-posts");
    if (!container) return;

    if (!posts.length) {
      container.innerHTML = `
        <p class="broadcast-muted">
          No updates have been published yet.
        </p>
      `;
      return;
    }

    container.innerHTML = "";

    for (const post of posts) {
      const article = document.createElement("article");
      article.className = "channel-post";

      const body = document.createElement("p");
      body.textContent = post.body;

      const time = document.createElement("time");
      time.dateTime = post.created_at;
      time.textContent = formatDate(post.created_at);

      article.append(body, time);
      container.append(article);
    }
  }

  async function loadPosts(channel) {
    const container = $("#channel-posts");
    if (!container) return;

    container.innerHTML = `
      <p class="broadcast-muted">Loading channel updates...</p>
    `;

    const { data, error } = await supabase
      .from("channel_posts")
      .select("id,channel_id,author_id,body,media_urls,created_at")
      .eq("channel_id", channel.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    renderPosts(data || []);
  }

  function updateChannelControls(channel) {
    const role = state.memberships.get(channel.id);
    const isOwner = channel.owner_id === state.user.id;
    const isMember = Boolean(role);

    const canPublish =
      isOwner ||
      ["owner", "moderator", "publisher"].includes(role);

    const canInvite =
      isOwner ||
      ["owner", "moderator", "publisher"].includes(role);

    $("#channel-role").textContent = isOwner
      ? "Owner"
      : role || "Visitor";

    $("#subscribe-button").hidden =
      channel.is_private || isMember || isOwner;

    $("#unsubscribe-button").hidden =
      !isMember || isOwner;

    $("#invite-member-button").hidden = !canInvite;
    $("#channel-post-form").hidden = !canPublish;

    $("#channel-visibility").textContent =
      channel.is_private ? "PRIVATE CHANNEL" : "PUBLIC CHANNEL";
  }

  async function openChannel(channel) {
    state.activeChannel = channel;

    $("#channel-empty").hidden = true;
    $("#channel-view").hidden = false;

    $("#channel-name").textContent = channel.name;
    $("#channel-description").textContent =
      channel.description || "No channel description.";

    $("#channel-avatar").textContent =
      (channel.name || "G").trim().charAt(0).toUpperCase();

    $("#channel-post-body").value = "";

    updateChannelControls(channel);
    renderChannels();

    try {
      await loadPosts(channel);
      status("");
    } catch (error) {
      console.error("Grove channel posts failed to load:", error);

      $("#channel-posts").innerHTML = `
        <p class="broadcast-muted">
          Could not load channel updates. Check your access and try again.
        </p>
      `;

      status(error.message || "Could not load channel updates.", true);
    }
  }

  async function subscribeToChannel() {
    const channel = state.activeChannel;
    if (!channel) return;

    try {
      status("Subscribing...");

      const { error } = await supabase
        .from("channel_members")
        .insert({
          channel_id: channel.id,
          user_id: state.user.id,
          role: "subscriber"
        });

      if (error) throw error;

      await loadChannels();

      const updated = state.channels.find(item => item.id === channel.id);
      if (updated) {
        state.activeChannel = updated;
        updateChannelControls(updated);
      }

      status("You are now subscribed.");

    } catch (error) {
      console.error("Grove channel subscription failed:", error);
      status(error.message || "Could not subscribe to this channel.", true);
    }
  }

  async function unsubscribeFromChannel() {
    const channel = state.activeChannel;
    if (!channel) return;

    if (!window.confirm(`Unsubscribe from ${channel.name}?`)) return;

    try {
      status("Unsubscribing...");

      const { error } = await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", channel.id)
        .eq("user_id", state.user.id);

      if (error) throw error;

      state.memberships.delete(channel.id);
      await loadChannels();

      const updated = state.channels.find(item => item.id === channel.id);

      if (updated) {
        state.activeChannel = updated;
        updateChannelControls(updated);
      } else {
        state.activeChannel = null;
        $("#channel-view").hidden = true;
        $("#channel-empty").hidden = false;
      }

      status("You have unsubscribed.");

    } catch (error) {
      console.error("Grove channel unsubscribe failed:", error);
      status(error.message || "Could not unsubscribe.", true);
    }
  }

  async function publishPost(event) {
    event.preventDefault();

    const channel = state.activeChannel;
    const body = $("#channel-post-body").value.trim();
    const button = $("#publish-channel-post");

    if (!channel || !body || button.disabled) return;

    if (body.length > 5000) {
      status("Channel updates must be 5,000 characters or fewer.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Publishing...";

    try {
      const { error } = await supabase
        .from("channel_posts")
        .insert({
          channel_id: channel.id,
          author_id: state.user.id,
          body,
          media_urls: []
        });

      if (error) throw error;

      $("#channel-post-body").value = "";
      await loadPosts(channel);
      status("Your channel update has been published.");

    } catch (error) {
      console.error("Grove channel post failed:", error);
      status(error.message || "Could not publish this update.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Publish update";
    }
  }

  async function createChannel(event) {
    event.preventDefault();

    const name = $("#new-channel-name").value.trim();
    const description = $("#new-channel-description").value.trim();
    const isPrivate = $("#new-channel-private").checked;
    const button = $("#save-channel-button");
    const errorNode = $("#create-channel-error");

    errorNode.textContent = "";

    if (!name || name.length > 60) {
      errorNode.textContent =
        "Channel names must contain 1–60 characters.";
      return;
    }

    if (description.length > 500) {
      errorNode.textContent =
        "Descriptions must be 500 characters or fewer.";
      return;
    }

    button.disabled = true;
    button.textContent = "Creating...";

    try {
      const { data: channel, error } = await supabase
        .from("broadcast_channels")
        .insert({
          owner_id: state.user.id,
          name,
          description,
          is_private: isPrivate
        })
        .select("id,owner_id,name,description,avatar_url,is_private,created_at")
        .single();

      if (error) throw error;

      const { error: memberError } = await supabase
        .from("channel_members")
        .insert({
          channel_id: channel.id,
          user_id: state.user.id,
          role: "owner"
        });

      if (memberError) {
        console.warn(
          "Channel created, but owner membership insert failed:",
          memberError
        );
      } else {
        state.memberships.set(channel.id, "owner");
      }

      state.channels.unshift(channel);

      closeDialog("channel-dialog");
      $("#create-channel-form").reset();

      await loadChannels();
      await openChannel(channel);

      status(
        memberError
          ? "Channel created. Owner access is retained; membership setup needs checking."
          : "Your channel has been created."
      );

    } catch (error) {
      console.error("Grove channel creation failed:", error);
      errorNode.textContent =
        error.message || "Could not create the channel.";
    } finally {
      button.disabled = false;
      button.textContent = "Create channel";
    }
  }

  function renderMemberResults(members) {
    const container = $("#invite-member-results");
    container.innerHTML = "";

    if (!members.length) {
      container.innerHTML = `
        <p class="broadcast-muted">No matching members found.</p>
      `;
      return;
    }

    for (const member of members) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "broadcast-member-result";

      const copy = document.createElement("span");
      copy.innerHTML = `
        <strong>
          ${escapeHTML(member.display_name || member.username || "Grove member")}
        </strong>
        <small>
          ${member.username
            ? "@" + escapeHTML(member.username)
            : "Grove member"}
        </small>
      `;

      const action = document.createElement("strong");
      action.textContent = "Invite";

      button.append(copy, action);
      button.addEventListener("click", () => sendInvite(member));

      container.append(button);
    }
  }

  async function searchMembers(term) {
    const container = $("#invite-member-results");

    if (term.length < 2) {
      container.innerHTML = `
        <p class="broadcast-muted">Type at least two characters.</p>
      `;
      return;
    }

    container.innerHTML = `
      <p class="broadcast-muted">Searching...</p>
    `;

    try {
      const safeTerm = term.replace(/[%_\\]/g, "").slice(0, 40);
      const pattern = `%${safeTerm}%`;

      const [nameResult, usernameResult] = await Promise.all([
        supabase
          .from("profile_directory")
          .select("id,username,display_name")
          .ilike("display_name", pattern)
          .limit(15),

        supabase
          .from("profile_directory")
          .select("id,username,display_name")
          .ilike("username", pattern)
          .limit(15)
      ]);

      if (nameResult.error) throw nameResult.error;
      if (usernameResult.error) throw usernameResult.error;

      const unique = new Map();

      for (const member of [
        ...(nameResult.data || []),
        ...(usernameResult.data || [])
      ]) {
        if (member.id && member.id !== state.user.id) {
          unique.set(member.id, member);
        }
      }

      renderMemberResults([...unique.values()]);

    } catch (error) {
      console.error("Grove channel member search failed:", error);

      container.innerHTML = `
        <p class="broadcast-muted">
          Member search failed. Try again.
        </p>
      `;
    }
  }

  async function sendInvite(member) {
    const channel = state.activeChannel;
    if (!channel) return;

    const feedback = $("#invite-member-feedback");

    try {
      feedback.textContent = "Sending invitation...";

      const { error } = await supabase
        .from("channel_invites")
        .insert({
          channel_id: channel.id,
          inviter_id: state.user.id,
          invitee_id: member.id
        });

      if (error) throw error;

      feedback.textContent =
        `Invitation sent to ${member.display_name || member.username || "member"}.`;

    } catch (error) {
      console.error("Grove channel invitation failed:", error);

      feedback.textContent =
        error.message || "Could not send this invitation.";
    }
  }

  function bindEvents() {
    $("#create-channel-button").addEventListener("click", () => {
      $("#create-channel-error").textContent = "";
      openDialog("channel-dialog");
      $("#new-channel-name").focus();
    });

    $("#close-channel-dialog").addEventListener(
      "click",
      () => closeDialog("channel-dialog")
    );

    $("#cancel-channel-dialog").addEventListener(
      "click",
      () => closeDialog("channel-dialog")
    );

    $("#create-channel-form").addEventListener("submit", createChannel);

    $("#close-invite-dialog").addEventListener(
      "click",
      () => closeDialog("invite-dialog")
    );

    $("#invite-member-button").addEventListener("click", () => {
      $("#invite-member-search").value = "";
      $("#invite-member-results").innerHTML = `
        <p class="broadcast-muted">
          Search for a member to invite.
        </p>
      `;
      $("#invite-member-feedback").textContent = "";
      openDialog("invite-dialog");
      $("#invite-member-search").focus();
    });

    $("#subscribe-button").addEventListener("click", subscribeToChannel);
    $("#unsubscribe-button").addEventListener("click", unsubscribeFromChannel);
    $("#channel-post-form").addEventListener("submit", publishPost);

    $("#refresh-channel-button").addEventListener("click", async () => {
      if (!state.activeChannel) return;

      try {
        await loadPosts(state.activeChannel);
        status("Channel updates refreshed.");
      } catch (error) {
        status(error.message || "Could not refresh channel updates.", true);
      }
    });

    $("#channel-search").addEventListener("input", () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(renderChannels, 180);
    });

    $("#invite-member-search").addEventListener("input", event => {
      clearTimeout(state.memberSearchTimer);

      const term = event.target.value.trim();

      state.memberSearchTimer = setTimeout(() => {
        searchMembers(term);
      }, 250);
    });

    for (const id of ["channel-dialog", "invite-dialog"]) {
      const overlay = document.getElementById(id);

      overlay.addEventListener("click", event => {
        if (event.target === overlay) closeDialog(id);
      });
    }

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      closeDialog("channel-dialog");
      closeDialog("invite-dialog");
    });
  }

  async function initialize() {
    try {
      await requireUser();
      bindEvents();

      // Load existing memberships first, then repair any accepted
      // invitations that were accepted before membership was created.
      await loadMemberships();

      const repair = await reconcileAcceptedInvites();

      await Promise.all([
        loadChannels(),
        loadInvites()
      ]);

      if (repair.failures.length) {
        status(
          "Some accepted invitations still need membership setup. Check the accepted-invite database policy.",
          true
        );
      } else if (repair.repaired) {
        status(
          `${repair.repaired} accepted channel invitation(s) activated.`
        );
      } else {
        status("Broadcast channels are ready.");
      }

      const requestedChannel =
        new URLSearchParams(location.search).get("channel");

      if (requestedChannel) {
        const channel = state.channels.find(
          item => item.id === requestedChannel
        );

        if (channel) {
          await openChannel(channel);
        }
      }

    } catch (error) {
      console.error(
        "Grove broadcast channels failed to initialize:",
        error
      );

      status(
        error.message || "Could not load broadcast channels.",
        true
      );
    }
  }

  initialize();
})();
