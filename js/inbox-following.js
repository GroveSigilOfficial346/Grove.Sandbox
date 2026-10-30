/* Grove inbox: quick access to followed members */
(() => {
  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = (id) => document.getElementById(id);
  let members = [];

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function render(list) {
    const host = $("followedChatList");
    if (!host) return;

    if (!list.length) {
      host.innerHTML = '<p class="muted">No followed members match that search.</p>';
      return;
    }

    host.innerHTML = list.map((member) => {
      const name = member.display_name || (member.username ? "@" + member.username : "Grove member");
      const avatar = member.avatar_url
        ? '<img class="avatar" src="' + escapeHTML(member.avatar_url) + '" alt="">'
        : '<div class="avatar">' + escapeHTML(name.slice(0, 1).toUpperCase()) + '</div>';

      return '<div class="member">' + avatar +
        '<div class="member-info"><strong>' + escapeHTML(name) +
        '</strong><small>@' + escapeHTML(member.username || "no-username") +
        '</small></div><button class="secondary" data-message-user="' +
        escapeHTML(member.username || "") + '">Message</button></div>';
    }).join("");
  }

  async function loadFollowedMembers() {
    const host = $("followedChatList");
    if (!host) return;

    host.innerHTML = '<p class="muted">Loading followed members…</p>';

    const { data: sessionData, error: sessionError } = await db.auth.getSession();
    const user = sessionData?.session?.user;

    if (sessionError || !user) {
      host.innerHTML = '<p class="muted">Sign in to see your followed members.</p>';
      return;
    }

    const { data: follows, error: followError } = await db
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .eq("status", "accepted");

    if (followError) {
      host.textContent = followError.message;
      return;
    }

    const ids = [...new Set((follows || []).map((row) => row.following_id))];

    if (!ids.length) {
      members = [];
      render([]);
      return;
    }

    const { data: profiles, error: profileError } = await db
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids)
      .order("username", { ascending: true });

    if (profileError) {
      host.textContent = profileError.message;
      return;
    }

    members = profiles || [];
    render(members);
  }

  function install() {
    const messages = $("messages");
    if (!messages || $("followedChatPanel")) return;

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "followedChatPanel";
    panel.innerHTML =
      '<h3>Message someone you follow</h3>' +
      '<input id="followedChatSearch" placeholder="Filter your followed members…">' +
      '<div id="followedChatList" style="margin-top:10px"></div>' +
      '<button id="refreshFollowedChat" class="secondary" style="margin-top:8px">Refresh list</button>';

    const chatLayout = messages.querySelector(".chat-layout");

    if (chatLayout) {
      messages.querySelector(".panel").insertBefore(panel, chatLayout);
    } else {
      messages.prepend(panel);
    }

    $("followedChatSearch").addEventListener("input", () => {
      const term = $("followedChatSearch").value.trim().replace(/^@/, "").toLowerCase();

      render(members.filter((member) =>
        (member.username || "").toLowerCase().includes(term) ||
        (member.display_name || "").toLowerCase().includes(term)
      ));
    });

    $("refreshFollowedChat").addEventListener("click", loadFollowedMembers);

    $("followedChatList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-message-user]");
      if (!button) return;

      const username = button.dataset.messageUser;
      if (!username) return;

      $("messageUsername").value = username;
      $("startChat").click();
    });

    loadFollowedMembers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
