import { supabase } from "./supabase.js";

(() => {
  "use strict";

  let user = null;
  let panel = null;
  let list = null;
  let status = null;
  let busy = false;

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function addStyles() {
    if (document.querySelector("#grove-followers-styles")) return;

    const style = el("style");
    style.id = "grove-followers-styles";
    style.textContent = `
      .grove-followers-panel{margin-top:16px;padding:16px;border:1px solid rgba(133,30,255,.3);border-radius:14px;background:#110b27;color:#f7f5ff}
      .grove-followers-panel[hidden]{display:none!important}
      .grove-followers-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      .grove-followers-heading h2{margin:0;font-size:1rem}
      .grove-followers-toggle,.grove-remove-follower{padding:9px 13px;border:1px solid rgba(5,201,244,.35);border-radius:9px;background:#1a1235;color:#8deaff;font-weight:700;cursor:pointer}
      .grove-followers-list{display:grid;gap:9px;margin-top:14px}
      .grove-follower-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px;border:1px solid rgba(190,150,255,.2);border-radius:10px;background:#1a1235}
      .grove-follower-identity{display:grid;gap:4px;min-width:0}
      .grove-follower-identity a{font-weight:750;overflow-wrap:anywhere}
      .grove-follower-identity small{color:#aaa2c4;overflow-wrap:anywhere}
      .grove-remove-follower{border-color:rgba(255,133,133,.4);background:rgba(255,133,133,.08);color:#ffaaaa;white-space:nowrap}
      .grove-remove-follower:disabled{opacity:.5;cursor:wait}
      .grove-followers-status{margin:10px 0 0;color:#05c9f4;font-size:.84rem}
      @media(max-width:480px){.grove-follower-row{align-items:flex-start;flex-direction:column}.grove-remove-follower{width:100%}}
    `;
    document.head.append(style);
  }

  function setStatus(text, error = false) {
    if (!status) return;
    status.textContent = text || "";
    status.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function createPanel() {
    if (panel) return;

    panel = el("section", "grove-followers-panel");
    panel.innerHTML = `
      <div class="grove-followers-heading">
        <h2>Manage followers</h2>
        <button type="button" class="grove-followers-toggle">
          View followers
        </button>
      </div>
      <div class="grove-followers-list" hidden></div>
      <p class="grove-followers-status" role="status" aria-live="polite"></p>
    `;

    const stats = document.querySelector("#profile-stats");
    const main = document.querySelector(".profile-main");

    if (stats) stats.insertAdjacentElement("afterend", panel);
    else if (main) main.append(panel);
    else return;

    list = panel.querySelector(".grove-followers-list");
    status = panel.querySelector(".grove-followers-status");

    panel.querySelector(".grove-followers-toggle")
      .addEventListener("click", async () => {
        const opening = list.hidden;
        list.hidden = !opening;

        panel.querySelector(".grove-followers-toggle").textContent =
          opening ? "Hide followers" : "View followers";

        if (opening) await loadFollowers();
      });
  }

  async function loadFollowers() {
    if (busy) return;
    busy = true;
    list.replaceChildren(el("p", "", "Loading followers..."));
    setStatus("");

    try {
      const { data: follows, error } = await supabase
        .from("follows")
        .select("follower_id,created_at")
        .eq("following_id", user.id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!follows?.length) {
        list.replaceChildren(el("p", "", "You don't have any followers yet."));
        return;
      }

      const ids = follows.map(row => row.follower_id);

      const { data: members, error: memberError } = await supabase
        .from("profile_directory")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);

      if (memberError) throw memberError;

      const byId = new Map((members || []).map(member => [member.id, member]));
      list.replaceChildren();

      for (const follow of follows) {
        const member = byId.get(follow.follower_id);
        if (!member) continue;

        const row = el("article", "grove-follower-row");
        const identity = el("div", "grove-follower-identity");

        const name = member.display_name ||
          (member.username ? "@" + member.username : "Grove member");

        const link = el("a", "", name);
        link.href = "/profile.html?id=" + encodeURIComponent(member.id);

        identity.append(link);

        if (member.username) {
          identity.append(el("small", "", "@" + member.username));
        }

        const remove = el("button", "grove-remove-follower", "Remove follower");
        remove.type = "button";
        remove.addEventListener("click", () => removeFollower(follow.follower_id, name, remove));

        row.append(identity, remove);
        list.append(row);
      }

      if (!list.childElementCount) {
        list.append(el("p", "", "No visible follower profiles."));
      }

    } catch (error) {
      console.error("Follower list failed:", error);
      list.replaceChildren(el("p", "", error.message || "Could not load followers."));
    } finally {
      busy = false;
    }
  }

  async function removeFollower(followerId, name, button) {
    if (!user || !followerId || button.disabled) return;

    const confirmed = window.confirm(
      `Remove ${name} from your followers? They will not be blocked and may follow again if your profile is public.`
    );

    if (!confirmed) return;

    button.disabled = true;
    setStatus("Removing follower...");

    try {
      const { data, error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", followerId)
        .eq("following_id", user.id)
        .eq("status", "accepted")
        .select("follower_id");

      if (error) throw error;
      if (!data?.length) {
        throw new Error("The follower could not be removed. Refresh and try again.");
      }

      setStatus(`${name} was removed from your followers.`);
      await loadFollowers();

      // Refreshes the profile's follower count using the existing counter.
      const stats = document.querySelector("#profile-stats");
      if (stats) {
        const count = await supabase
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("following_id", user.id)
          .eq("status", "accepted");

        if (!count.error) {
          const followerStat = [...stats.children].find(node =>
            node.textContent.toLowerCase().includes("followers")
          );
          if (followerStat) {
            followerStat.textContent = `${count.count ?? 0} Followers`;
          }
        }
      }

    } catch (error) {
      console.error("Remove follower failed:", error);
      setStatus(error.message || "Could not remove follower.", true);
      button.disabled = false;
    }
  }

  async function initialize() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      user = data.user;
      if (!user) return;

      const params = new URLSearchParams(location.search);
      const requestedId = params.get("id");
      const requestedUsername = params.get("username");

      // Only show management controls on the signed-in user's own profile.
      if (requestedId && requestedId !== user.id) return;

      if (requestedUsername) {
        const { data: profile, error: profileError } = await supabase
          .from("profile_directory")
          .select("id")
          .eq("username", requestedUsername.toLowerCase())
          .maybeSingle();

        if (profileError) throw profileError;
        if (profile?.id !== user.id) return;
      }

      addStyles();
      createPanel();

    } catch (error) {
      console.warn("Follower management unavailable:", error);
    }
  }

  initialize();
})();
