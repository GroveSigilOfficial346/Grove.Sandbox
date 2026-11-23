(function () {
  "use strict";

  const client = window.supabaseClient;

  const pageStatus = document.getElementById("page-status");
  const refreshButton = document.getElementById("refresh-button");
  const logoutButton = document.getElementById("logout-button");

  const sections = {
    incoming: {
      list: document.getElementById("incoming-list"),
      count: document.getElementById("incoming-count")
    },
    outgoing: {
      list: document.getElementById("outgoing-list"),
      count: document.getElementById("outgoing-count")
    },
    followers: {
      list: document.getElementById("followers-list"),
      count: document.getElementById("followers-count")
    },
    following: {
      list: document.getElementById("following-list"),
      count: document.getElementById("following-count")
    }
  };

  let currentUser = null;
  let busy = false;

  function setStatus(message, type) {
    pageStatus.textContent = message || "";
    pageStatus.dataset.type = type || "info";
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function emptyMessage(list, message) {
    list.replaceChildren(element("p", "empty-message", message));
  }

  function setCount(section, value) {
    sections[section].count.textContent = String(value);
  }

  async function getProfiles(ids) {
    const uniqueIds = [...new Set(ids)].filter(Boolean);

    if (!uniqueIds.length) return new Map();

    const { data, error } = await client
      .from("profiles")
      .select("id, username, display_name, is_private")
      .in("id", uniqueIds);

    if (error) throw error;

    return new Map((data || []).map(profile => [profile.id, profile]));
  }

  function memberDetails(profile) {
    if (!profile) {
      return {
        name: "Private Grove member",
        username: "",
        private: true
      };
    }

    return {
      name: profile.display_name || profile.username || "Grove member",
      username: profile.username ? "@" + profile.username : "",
      private: false
    };
  }

  function addMember(section, profile, fallbackId, actions) {
    const list = sections[section].list;
    const details = memberDetails(profile);

    const item = element("article", "network-item");
    const info = element("div", "member-info");

    info.appendChild(element("div", "member-name", details.name));

    if (details.username) {
      info.appendChild(
        element("div", "member-username", details.username)
      );
    }

    if (details.private) {
      info.appendChild(
        element("div", "member-private", "Profile details are private.")
      );
    }

    const actionArea = element("div", "member-actions");

    actions.forEach(action => {
      const button = element(
        "button",
        action.className || "",
        action.label
      );

      button.type = "button";
      button.addEventListener("click", () => {
        action.run(fallbackId, button);
      });

      actionArea.appendChild(button);
    });

    item.append(info, actionArea);
    list.appendChild(item);
  }

  async function loadNetwork() {
    if (busy) return;

    busy = true;
    refreshButton.disabled = true;
    setStatus("Loading your Grove network...", "info");

    Object.values(sections).forEach(section => {
      section.list.replaceChildren();
      section.count.textContent = "0";
    });

    try {
      const { data: userData, error: userError } =
        await client.auth.getUser();

      if (userError) throw userError;

      currentUser = userData.user;

      if (!currentUser) {
        window.location.href = "login.html";
        return;
      }

      const [
        incomingResult,
        outgoingResult,
        followersResult,
        followingResult
      ] = await Promise.all([
        client
          .from("follows")
          .select("follower_id, following_id, status, created_at")
          .eq("following_id", currentUser.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),

        client
          .from("follows")
          .select("follower_id, following_id, status, created_at")
          .eq("follower_id", currentUser.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),

        client
          .from("follows")
          .select("follower_id, following_id, status, created_at")
          .eq("following_id", currentUser.id)
          .eq("status", "accepted")
          .order("created_at", { ascending: false }),

        client
          .from("follows")
          .select("follower_id, following_id, status, created_at")
          .eq("follower_id", currentUser.id)
          .eq("status", "accepted")
          .order("created_at", { ascending: false })
      ]);

      const results = [
        incomingResult,
        outgoingResult,
        followersResult,
        followingResult
      ];

      const failed = results.find(result => result.error);
      if (failed) throw failed.error;

      const incoming = incomingResult.data || [];
      const outgoing = outgoingResult.data || [];
      const followers = followersResult.data || [];
      const following = followingResult.data || [];

      const profileIds = [
        ...incoming.map(row => row.follower_id),
        ...outgoing.map(row => row.following_id),
        ...followers.map(row => row.follower_id),
        ...following.map(row => row.following_id)
      ];

      const profiles = await getProfiles(profileIds);

      setCount("incoming", incoming.length);
      setCount("outgoing", outgoing.length);
      setCount("followers", followers.length);
      setCount("following", following.length);

      if (!incoming.length) {
        emptyMessage(sections.incoming.list, "No pending follow requests.");
      } else {
        incoming.forEach(row => {
          addMember(
            "incoming",
            profiles.get(row.follower_id),
            row.follower_id,
            [
              {
                label: "ACCEPT",
                className: "primary",
                run: acceptRequest
              },
              {
                label: "DECLINE",
                className: "danger",
                run: declineRequest
              }
            ]
          );
        });
      }

      if (!outgoing.length) {
        emptyMessage(sections.outgoing.list, "No sent requests.");
      } else {
        outgoing.forEach(row => {
          addMember(
            "outgoing",
            profiles.get(row.following_id),
            row.following_id,
            [
              {
                label: "CANCEL REQUEST",
                className: "danger",
                run: cancelRequest
              }
            ]
          );
        });
      }

      if (!followers.length) {
        emptyMessage(sections.followers.list, "No followers yet.");
      } else {
        followers.forEach(row => {
          addMember(
            "followers",
            profiles.get(row.follower_id),
            row.follower_id,
            [
              {
                label: "REMOVE",
                className: "danger",
                run: removeFollower
              }
            ]
          );
        });
      }

      if (!following.length) {
        emptyMessage(sections.following.list, "You are not following anyone yet.");
      } else {
        following.forEach(row => {
          addMember(
            "following",
            profiles.get(row.following_id),
            row.following_id,
            [
              {
                label: "UNFOLLOW",
                className: "danger",
                run: unfollow
              }
            ]
          );
        });
      }

      setStatus("Your Grove network is up to date.", "success");
    } catch (error) {
      console.error("Grove network error:", error);
      setStatus(error.message || "Could not load your network.", "error");
    } finally {
      busy = false;
      refreshButton.disabled = false;
    }
  }

  async function acceptRequest(followerId, button) {
    if (!currentUser) return;

    button.disabled = true;

    try {
      const { error } = await client
        .from("follows")
        .update({ status: "accepted" })
        .eq("follower_id", followerId)
        .eq("following_id", currentUser.id)
        .eq("status", "pending");

      if (error) throw error;

      setStatus("Follow request accepted.", "success");
      await loadNetwork();
    } catch (error) {
      console.error("Accept request error:", error);
      setStatus(error.message || "Could not accept request.", "error");
      button.disabled = false;
    }
  }

  async function declineRequest(followerId, button) {
    if (!currentUser) return;

    if (!window.confirm("Decline this follow request?")) return;

    button.disabled = true;

    try {
      const { error } = await client
        .from("follows")
        .delete()
        .eq("follower_id", followerId)
        .eq("following_id", currentUser.id)
        .eq("status", "pending");

      if (error) throw error;

      setStatus("Follow request declined.", "success");
      await loadNetwork();
    } catch (error) {
      console.error("Decline request error:", error);
      setStatus(error.message || "Could not decline request.", "error");
      button.disabled = false;
    }
  }

  async function cancelRequest(targetId, button) {
    if (!currentUser) return;

    button.disabled = true;

    try {
      const { error } = await client
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", targetId)
        .eq("status", "pending");

      if (error) throw error;

      setStatus("Follow request cancelled.", "success");
      await loadNetwork();
    } catch (error) {
      console.error("Cancel request error:", error);
      setStatus(error.message || "Could not cancel request.", "error");
      button.disabled = false;
    }
  }

  async function removeFollower(followerId, button) {
    if (!currentUser) return;

    if (!window.confirm("Remove this follower from your network?")) return;

    button.disabled = true;

    try {
      const { error } = await client
        .from("follows")
        .delete()
        .eq("follower_id", followerId)
        .eq("following_id", currentUser.id);

      if (error) throw error;

      setStatus("Follower removed.", "success");
      await loadNetwork();
    } catch (error) {
      console.error("Remove follower error:", error);
      setStatus(error.message || "Could not remove follower.", "error");
      button.disabled = false;
    }
  }

  async function unfollow(targetId, button) {
    if (!currentUser) return;

    if (!window.confirm("Unfollow this Grove member?")) return;

    button.disabled = true;

    try {
      const { error } = await client
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", targetId);

      if (error) throw error;

      setStatus("You unfollowed this member.", "success");
      await loadNetwork();
    } catch (error) {
      console.error("Unfollow error:", error);
      setStatus(error.message || "Could not unfollow member.", "error");
      button.disabled = false;
    }
  }

  refreshButton.addEventListener("click", loadNetwork);

  logoutButton.addEventListener("click", async function () {
    logoutButton.disabled = true;

    try {
      await window.GROVE_AUTH.signOut();
      window.location.href = "index.html";
    } catch (error) {
      setStatus(error.message || "Logout failed.", "error");
      logoutButton.disabled = false;
    }
  });

  if (!client) {
    setStatus("Supabase is not connected.", "error");
    return;
  }

  loadNetwork();
})();
