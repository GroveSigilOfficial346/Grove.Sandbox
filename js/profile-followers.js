import { supabase } from "./supabase.js";

(() => {
  "use strict";

  let user = null;
  let panel = null;
  let busy = {
    followers: false,
    following: false
  };

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
      .grove-followers-panel {
        margin-top: 16px;
        padding: 16px;
        border: 1px solid rgba(133,30,255,.3);
        border-radius: 14px;
        background: #110b27;
        color: #f7f5ff;
      }

      .grove-followers-panel[hidden],
      .grove-network-list[hidden] {
        display: none !important;
      }

      .grove-followers-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .grove-followers-heading h2 {
        margin: 0;
        font-size: 1rem;
      }

      .grove-network-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .grove-followers-toggle,
      .grove-remove-follower {
        padding: 9px 13px;
        border: 1px solid rgba(5,201,244,.35);
        border-radius: 9px;
        background: #1a1235;
        color: #8deaff;
        font-weight: 700;
        cursor: pointer;
      }

      .grove-followers-toggle[aria-pressed="true"] {
        border-color: rgba(235,54,237,.65);
        color: #fff;
      }

      .grove-network-list {
        display: grid;
        gap: 9px;
        margin-top: 14px;
      }

      .grove-follower-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 11px;
        border: 1px solid rgba(190,150,255,.2);
        border-radius: 10px;
        background: #1a1235;
      }

      .grove-follower-identity {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .grove-follower-identity a {
        font-weight: 750;
        overflow-wrap: anywhere;
      }

      .grove-follower-identity a:hover {
        color: #05c9f4;
      }

      .grove-follower-identity small {
        color: #aaa2c4;
        overflow-wrap: anywhere;
      }

      .grove-remove-follower {
        border-color: rgba(255,133,133,.4);
        background: rgba(255,133,133,.08);
        color: #ffaaaa;
        white-space: nowrap;
      }

      .grove-remove-follower:disabled {
        opacity: .5;
        cursor: wait;
      }

      .grove-followers-status {
        margin: 10px 0 0;
        color: #05c9f4;
        font-size: .84rem;
      }

      @media(max-width:480px) {
        .grove-followers-heading {
          align-items: stretch;
          flex-direction: column;
        }

        .grove-network-controls {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .grove-followers-toggle {
          min-width: 0;
        }

        .grove-follower-row {
          align-items: flex-start;
          flex-direction: column;
        }

        .grove-remove-follower {
          width: 100%;
        }
      }
    `;

    document.head.append(style);
  }

  function setStatus(text, error = false) {
    const status = panel?.querySelector(".grove-followers-status");

    if (!status) return;

    status.textContent = text || "";
    status.style.color = error ? "#ff8585" : "#05c9f4";
  }

  function createPanel() {
    if (panel) return;

    panel = el("section", "grove-followers-panel");

    const heading = el("div", "grove-followers-heading");
    const title = el("h2", "", "Your network");

    const controls = el("div", "grove-network-controls");

    const followersButton = el(
      "button",
      "grove-followers-toggle",
      "View followers"
    );

    followersButton.type = "button";
    followersButton.dataset.network = "followers";
    followersButton.setAttribute("aria-pressed", "false");

    const followingButton = el(
      "button",
      "grove-followers-toggle",
      "View following"
    );

    followingButton.type = "button";
    followingButton.dataset.network = "following";
    followingButton.setAttribute("aria-pressed", "false");

    controls.append(followersButton, followingButton);
    heading.append(title, controls);

    const followersList = el("div", "grove-network-list");
    followersList.dataset.list = "followers";
    followersList.hidden = true;

    const followingList = el("div", "grove-network-list");
    followingList.dataset.list = "following";
    followingList.hidden = true;

    const status = el("p", "grove-followers-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    panel.append(
      heading,
      followersList,
      followingList,
      status
    );

    const stats = document.querySelector("#profile-stats");
    const main = document.querySelector(".profile-main");

    if (stats) {
      stats.insertAdjacentElement("afterend", panel);
    } else if (main) {
      main.append(panel);
    } else {
      panel = null;
      return;
    }

    followersButton.addEventListener("click", () => {
      showNetwork("followers");
    });

    followingButton.addEventListener("click", () => {
      showNetwork("following");
    });
  }

  function showNetwork(type) {
    const list = panel.querySelector(`[data-list="${type}"]`);

    if (!list) return;

    const wasHidden = list.hidden;

    panel.querySelectorAll(".grove-network-list").forEach(item => {
      item.hidden = true;
    });

    panel.querySelectorAll(".grove-followers-toggle").forEach(button => {
      button.setAttribute("aria-pressed", "false");
    });

    if (!wasHidden) {
      setStatus("");
      return;
    }

    list.hidden = false;

    const button = panel.querySelector(
      `[data-network="${type}"]`
    );

    button?.setAttribute("aria-pressed", "true");

    loadNetwork(type);
  }

  async function loadNetwork(type) {
    if (!user || busy[type]) return;

    const list = panel.querySelector(`[data-list="${type}"]`);

    if (!list) return;

    busy[type] = true;

    list.replaceChildren(
      el("p", "", `Loading ${type}...`)
    );

    setStatus("");

    try {
      const isFollowers = type === "followers";

      const { data: relationships, error } = await supabase
        .from("follows")
        .select(
          isFollowers
            ? "follower_id,created_at"
            : "following_id,created_at"
        )
        .eq(
          isFollowers ? "following_id" : "follower_id",
          user.id
        )
        .eq("status", "accepted")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!relationships?.length) {
        list.replaceChildren(
          el(
            "p",
            "",
            isFollowers
              ? "You don't have any followers yet."
              : "You aren't following anyone yet."
          )
        );

        return;
      }

      const memberIds = relationships.map(row =>
        isFollowers ? row.follower_id : row.following_id
      );

      const { data: members, error: memberError } = await supabase
        .from("profile_directory")
        .select("id,username,display_name,avatar_url")
        .in("id", memberIds);

      if (memberError) throw memberError;

      const byId = new Map(
        (members || []).map(member => [member.id, member])
      );

      list.replaceChildren();

      for (const relationship of relationships) {
        const memberId = isFollowers
          ? relationship.follower_id
          : relationship.following_id;

        const member = byId.get(memberId);

        if (!member) continue;

        const row = el("article", "grove-follower-row");
        const identity = el("div", "grove-follower-identity");

        const name = member.display_name ||
          (member.username
            ? "@" + member.username
            : "Grove member");

        const link = el("a", "", name);

        link.href =
          "/profile.html?id=" +
          encodeURIComponent(member.id);

        identity.append(link);

        if (member.username) {
          identity.append(
            el("small", "", "@" + member.username)
          );
        }

        row.append(identity);

        if (isFollowers) {
          const remove = el(
            "button",
            "grove-remove-follower",
            "Remove follower"
          );

          remove.type = "button";

          remove.addEventListener("click", () => {
            removeFollower(
              relationship.follower_id,
              name,
              remove
            );
          });

          row.append(remove);
        }

        list.append(row);
      }

      if (!list.childElementCount) {
        list.append(
          el("p", "", "No visible member profiles.")
        );
      }

    } catch (error) {
      console.error(`${type} list failed:`, error);

      list.replaceChildren(
        el(
          "p",
          "",
          error.message || `Could not load ${type}.`
        )
      );

    } finally {
      busy[type] = false;
    }
  }

  async function refreshFollowerCount() {
    const stats = document.querySelector("#profile-stats");

    if (!stats) return;

    const { count, error } = await supabase
      .from("follows")
      .select("follower_id", {
        count: "exact",
        head: true
      })
      .eq("following_id", user.id)
      .eq("status", "accepted");

    if (error) {
      console.warn("Follower count refresh failed:", error);
      return;
    }

    const followerStat = [...stats.children].find(node =>
      node.textContent.toLowerCase().includes("followers")
    );

    if (followerStat) {
      followerStat.textContent = `${count ?? 0} Followers`;
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
        throw new Error(
          "The follower could not be removed. Refresh and try again."
        );
      }

      setStatus(`${name} was removed from your followers.`);

      await Promise.all([
        loadNetwork("followers"),
        refreshFollowerCount()
      ]);

    } catch (error) {
      console.error("Remove follower failed:", error);

      setStatus(
        error.message || "Could not remove follower.",
        true
      );

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

      if (requestedId && requestedId !== user.id) return;

      if (requestedUsername) {
        const { data: profile, error: profileError } =
          await supabase
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
      console.warn("Network management unavailable:", error);
    }
  }

  initialize();
})();
