(() => {
  "use strict";

  const SUPABASE_URL = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_UmVS_gKz5AW09p64FWf4yA_EKjW6U0Z";
  const MEDIA_BUCKET = "grove-media";
  const PRIVATE_BUCKET = "grove-private";

  const $ = (selector) => document.querySelector(selector);

  let client;
  let currentUser = null;
  let profile = null;
  let isOwner = false;
  let isAcceptedFollower = false;
  let imageButtonsBound = false;

  function setActionStatus(message, isError = false) {
    const el = $("#action-status");
    if (!el) return;

    el.textContent = message;
    el.style.color = isError ? "#ff9caa" : "#45e5ff";
  }

  function showError(message) {
    const status = $("#status");

    if (status) {
      status.textContent = message;
      status.hidden = false;
    }
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);

      return ["https:", "http:"].includes(url.protocol)
        ? url
        : null;
    } catch {
      return null;
    }
  }

  function initial(value) {
    return (value || "G").trim().charAt(0).toUpperCase() || "G";
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  async function resolveMedia(value) {
    if (!value) return null;

    if (value.startsWith("private:")) {
      const path = value.slice("private:".length);

      const { data, error } = await client.storage
        .from(PRIVATE_BUCKET)
        .createSignedUrl(path, 3600);

      if (error) {
        console.warn("Private media unavailable:", error.message);
        return null;
      }

      return data?.signedUrl || null;
    }

    if (value.startsWith("public:")) {
      const path = value.slice("public:".length);

      const { data } = client.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(path);

      return data?.publicUrl || null;
    }

    return safeUrl(value)?.href || null;
  }

  // --------------------------------------------------
  // Profile rendering
  // --------------------------------------------------

  async function renderProfile(data) {
    $("#display-name").textContent =
      data.display_name || "Grove Member";

    $("#username").textContent =
      data.username ? `@${data.username}` : "";

    const bio = $("#bio");

    if (data.bio?.trim()) {
      bio.textContent = data.bio;
      bio.hidden = false;
    } else {
      bio.hidden = true;
    }

    const avatar = $("#avatar");
    avatar.replaceChildren();

    const avatarUrl = await resolveMedia(data.avatar_url);

    if (avatarUrl) {
      const image = document.createElement("img");

      image.src = avatarUrl;
      image.alt = `${data.display_name || "Member"}'s profile picture`;
      image.loading = "lazy";

      avatar.appendChild(image);
    } else {
      avatar.textContent = initial(data.display_name);
    }

    const cover = $("#cover");
    cover.style.backgroundImage = "";

    const coverUrl = await resolveMedia(data.cover_url);

    if (coverUrl) {
      cover.style.backgroundImage = `url("${coverUrl.replace(/["\\]/g, "\\$&")}")`;
    }

    const details = $("#details");
    details.replaceChildren();

    if (data.location) {
      details.appendChild(
        createElement("span", "", `📍 ${data.location}`)
      );
    }

    if (data.pronouns) {
      details.appendChild(
        createElement("span", "", data.pronouns)
      );
    }

    if (data.website) {
      let value = data.website.trim();

      if (!/^https?:\/\//i.test(value)) {
        value = `https://${value}`;
      }

      const url = safeUrl(value);

      if (url) {
        const link = createElement("a", "", "Website");

        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        details.appendChild(link);
      }
    }
  }

  // --------------------------------------------------
  // Followers and following
  // --------------------------------------------------

  function addRelationshipStyles() {
    if ($("#grove-relationship-styles")) return;

    const style = createElement("style");
    style.id = "grove-relationship-styles";

    style.textContent = `
      .grove-relationships {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }

      .grove-relationship-panel {
        flex: 1 1 260px;
        min-width: 0;
        padding: 16px;
        border: 1px solid #851eff44;
        border-radius: 13px;
        background: #08051a;
      }

      .grove-relationship-panel h2 {
        margin: 0 0 12px;
        color: #f7f5ff;
        font-size: 15px;
      }

      .grove-relationship-count {
        color: #45e5ff;
        font-weight: 700;
      }

      .grove-member-list {
        display: grid;
        gap: 9px;
      }

      .grove-member-link {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        padding: 8px;
        border-radius: 9px;
        color: #f7f5ff;
        text-decoration: none;
        background: #111025;
      }

      .grove-member-link:hover {
        background: #20143b;
      }

      .grove-member-avatar {
        display: grid;
        place-items: center;
        flex: 0 0 38px;
        width: 38px;
        height: 38px;
        overflow: hidden;
        border-radius: 50%;
        background: #851eff;
        color: white;
        font-weight: 700;
      }

      .grove-member-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .grove-member-name {
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: 13px;
      }

      .grove-member-username {
        display: block;
        margin-top: 2px;
        color: #45e5ff;
        font-size: 11px;
      }

      .grove-member-empty {
        color: #a99bc9;
        font-size: 13px;
      }
    `;

    document.head.appendChild(style);
  }

  async function renderMemberList(container, members, emptyMessage) {
    container.replaceChildren();

    if (!members.length) {
      container.appendChild(
        createElement("p", "grove-member-empty", emptyMessage)
      );
      return;
    }

    for (const member of members) {
      const link = createElement("a", "grove-member-link");

      link.href = member.username
        ? `profile.html?username=${encodeURIComponent(member.username)}`
        : `profile.html?id=${encodeURIComponent(member.id)}`;

      const avatar = createElement("div", "grove-member-avatar");
      const avatarUrl = await resolveMedia(member.avatar_url);

      if (avatarUrl) {
        const image = document.createElement("img");
        image.src = avatarUrl;
        image.alt = "";
        image.loading = "lazy";
        avatar.appendChild(image);
      } else {
        avatar.textContent = initial(member.display_name);
      }

      const name = createElement("span", "grove-member-name");
      name.appendChild(
        document.createTextNode(member.display_name || "Grove Member")
      );

      if (member.username) {
        name.appendChild(
          createElement("span", "grove-member-username", `@${member.username}`)
        );
      }

      link.append(avatar, name);
      container.appendChild(link);
    }
  }

  async function loadRelationships() {
    addRelationshipStyles();

    let section = $("#grove-relationships");

    if (!section) {
      section = createElement("section", "grove-relationships");
      section.id = "grove-relationships";
      section.setAttribute("aria-label", "Followers and following");

      const details = $("#details");
      details.insertAdjacentElement("afterend", section);
    }

    section.replaceChildren(
      createElement("p", "grove-member-empty", "Loading followers and following…")
    );

    const [followersResult, followingResult] = await Promise.all([
      client
        .from("follows")
        .select("follower_id")
        .eq("following_id", profile.id)
        .eq("status", "accepted"),

      client
        .from("follows")
        .select("following_id")
        .eq("follower_id", profile.id)
        .eq("status", "accepted")
    ]);

    if (followersResult.error || followingResult.error) {
      console.error(
        "Relationship lookup failed:",
        followersResult.error || followingResult.error
      );

      section.replaceChildren(
        createElement(
          "p",
          "grove-member-empty",
          "Followers and following could not be loaded. Check the follows table read permissions."
        )
      );

      return;
    }

    const followerIds = [
      ...new Set((followersResult.data || []).map((row) => row.follower_id))
    ];

    const followingIds = [
      ...new Set((followingResult.data || []).map((row) => row.following_id))
    ];

    const allIds = [...new Set([...followerIds, ...followingIds])];

    let members = [];

    if (allIds.length) {
      const { data, error } = await client
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", allIds);

      if (error) {
        console.error("Relationship profiles failed:", error);

        section.replaceChildren(
          createElement(
            "p",
            "grove-member-empty",
            "Member details could not be loaded."
          )
        );

        return;
      }

      members = data || [];
    }

    const memberMap = new Map(members.map((member) => [member.id, member]));

    const followers = followerIds
      .map((id) => memberMap.get(id))
      .filter(Boolean);

    const following = followingIds
      .map((id) => memberMap.get(id))
      .filter(Boolean);

    const followersPanel = createElement("div", "grove-relationship-panel");
    const followingPanel = createElement("div", "grove-relationship-panel");

    const followersHeading = createElement("h2");
    followersHeading.append(
      document.createTextNode("Followers "),
      createElement("span", "grove-relationship-count", `(${followerIds.length})`)
    );

    const followingHeading = createElement("h2");
    followingHeading.append(
      document.createTextNode("Following "),
      createElement("span", "grove-relationship-count", `(${followingIds.length})`)
    );

    const followersList = createElement("div", "grove-member-list");
    const followingList = createElement("div", "grove-member-list");

    followersPanel.append(followersHeading, followersList);
    followingPanel.append(followingHeading, followingList);
    section.append(followersPanel, followingPanel);

    await Promise.all([
      renderMemberList(followersList, followers, "No followers yet."),
      renderMemberList(followingList, following, "Not following anyone yet.")
    ]);
  }

  // --------------------------------------------------
  // Follow actions
  // --------------------------------------------------

  async function checkFollowState() {
    if (!currentUser || isOwner) return;

    const { data: follow, error } = await client
      .from("follows")
      .select("status")
      .eq("follower_id", currentUser.id)
      .eq("following_id", profile.id)
      .maybeSingle();

    if (error) {
      console.warn("Follow status unavailable:", error.message);
    }

    isAcceptedFollower = follow?.status === "accepted";

    const button = $("#follow-button");

    if (isAcceptedFollower) {
      button.textContent = "Following";
      button.dataset.pending = "false";
      return;
    }

    if (profile.is_private) {
      const { data: request, error: requestError } = await client
        .from("follow_requests")
        .select("id,status")
        .eq("requester_id", currentUser.id)
        .eq("target_id", profile.id)
        .eq("status", "pending")
        .maybeSingle();

      if (requestError) {
        console.warn("Follow request status unavailable:", requestError.message);
      }

      button.textContent = request ? "Requested" : "Request to follow";
      button.dataset.pending = request ? "true" : "false";
    } else {
      button.textContent = "Follow";
      button.dataset.pending = "false";
    }
  }

  async function handleFollow() {
    if (!currentUser || isOwner) return;

    const button = $("#follow-button");
    button.disabled = true;

    try {
      if (isAcceptedFollower) {
        const { error } = await client
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.id);

        if (error) throw error;

        isAcceptedFollower = false;
        button.dataset.pending = "false";
        button.textContent = profile.is_private
          ? "Request to follow"
          : "Follow";

        setActionStatus("You unfollowed this member.");

        if (profile.is_private) {
          $("#music-section").hidden = true;
          $("#posts-section").hidden = true;
          $("#private-note").hidden = false;
        }

        await loadRelationships();
        return;
      }

      if (profile.is_private) {
        if (button.dataset.pending === "true") {
          setActionStatus("Your follow request is already pending.");
          return;
        }

        const { error } = await client
          .from("follow_requests")
          .insert({
            requester_id: currentUser.id,
            target_id: profile.id,
            status: "pending"
          });

        if (error) throw error;

        button.dataset.pending = "true";
        button.textContent = "Requested";

        setActionStatus("Follow request sent.");
      } else {
        const { error } = await client
          .from("follows")
          .insert({
            follower_id: currentUser.id,
            following_id: profile.id,
            status: "accepted"
          });

        if (error) throw error;

        isAcceptedFollower = true;
        button.textContent = "Following";

        setActionStatus("You are now following this member.");
      }

      await loadRelationships();
    } catch (error) {
      console.error("Follow action failed:", error);
      setActionStatus(error.message || "Could not update follow status.", true);
    } finally {
      button.disabled = false;
    }
  }

  // --------------------------------------------------
  // Avatar and cover uploads
  // --------------------------------------------------

  async function uploadProfileImage(kind, file) {
    if (!isOwner || !file) return;

    if (!file.type.startsWith("image/")) {
      setActionStatus("Choose an image file.", true);
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setActionStatus("Images must be 8 MB or smaller.", true);
      return;
    }

    const button = kind === "avatar"
      ? $("#avatar-upload-button")
      : $("#cover-upload-button");

    if (button) button.disabled = true;

    setActionStatus(`Uploading ${kind === "cover" ? "cover photo" : "profile photo"}…`);

    let uploadedPath = null;
    let bucket = null;

    try {
      const extension = (
        file.name.split(".").pop() || "jpg"
      ).toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";

      bucket = profile.is_private ? PRIVATE_BUCKET : MEDIA_BUCKET;

      uploadedPath =
        `${currentUser.id}/profile/${kind}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await client.storage
        .from(bucket)
        .upload(uploadedPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      const storedValue = bucket === PRIVATE_BUCKET
        ? `private:${uploadedPath}`
        : `public:${uploadedPath}`;

      const column = kind === "avatar" ? "avatar_url" : "cover_url";

      const { data: updatedProfile, error: updateError } = await client
        .from("profiles")
        .update({
          [column]: storedValue,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUser.id)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updatedProfile) {
        throw new Error(
          "The image uploaded, but Supabase did not update your profile. Check your profiles UPDATE policy."
        );
      }

      profile[column] = storedValue;

      if (kind === "cover") {
        const cover = $("#cover");
        const url = await resolveMedia(storedValue);

        if (!url) {
          throw new Error(
            "The cover was saved, but its image URL could not be resolved. Check storage permissions."
          );
        }

        cover.style.backgroundImage = `url("${url.replace(/["\\]/g, "\\$&")}")`;
      } else {
        await renderProfile(profile);
      }

      setActionStatus(
        kind === "avatar" ? "Profile photo updated." : "Cover photo updated."
      );
    } catch (error) {
      console.error("Profile image upload failed:", error);

      if (uploadedPath && bucket) {
        const { error: cleanupError } = await client.storage
          .from(bucket)
          .remove([uploadedPath]);

        if (cleanupError) {
          console.warn("Uploaded image cleanup failed:", cleanupError);
        }
      }

      setActionStatus(error.message || "Image upload failed.", true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function bindImageButtons() {
    if (imageButtonsBound) return;
    imageButtonsBound = true;

    const avatarButton = $("#avatar-upload-button");
    const coverButton = $("#cover-upload-button");
    const avatarInput = $("#avatar-file");
    const coverInput = $("#cover-file");

    if (avatarButton && avatarInput) {
      avatarButton.addEventListener("click", (event) => {
        event.preventDefault();

        if (isOwner) avatarInput.click();
      });
    }

    if (coverButton && coverInput) {
      coverButton.addEventListener("click", (event) => {
        event.preventDefault();

        if (isOwner) coverInput.click();
      });
    } else {
      console.error("Grove cover upload button or input is missing.");
    }

    if (avatarInput) {
      avatarInput.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];

        if (file) await uploadProfileImage("avatar", file);

        event.target.value = "";
      });
    }

    if (coverInput) {
      coverInput.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];

        if (file) await uploadProfileImage("cover", file);

        event.target.value = "";
      });
    }
  }

  // --------------------------------------------------
  // Profile music
  // --------------------------------------------------

  async function loadMusic() {
    const section = $("#music-section");
    const content = $("#music-content");

    content.replaceChildren();

    if (!profile.profile_music_enabled) {
      section.hidden = true;
      return;
    }

    let track = null;

    const { data: tracks, error } = await client
      .from("audio_tracks")
      .select("id,title,artist,storage_path,mime_type,allow_download")
      .eq("owner_id", profile.id)
      .eq("is_profile_track", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.warn("Profile track lookup failed:", error.message);
    }

    if (tracks?.length) track = tracks[0];

    let audioUrl = null;
    let canDownload = false;

    if (profile.profile_music_url) {
      audioUrl = await resolveMedia(profile.profile_music_url);

      canDownload = Boolean(profile.allow_music_downloads && audioUrl);
    }

    if (!audioUrl && track?.storage_path) {
      const { data: privateData, error: privateError } = await client.storage
        .from(PRIVATE_BUCKET)
        .createSignedUrl(track.storage_path, 3600);

      if (!privateError) audioUrl = privateData?.signedUrl || null;

      if (!audioUrl) {
        const { data: publicData } = client.storage
          .from(MEDIA_BUCKET)
          .getPublicUrl(track.storage_path);

        audioUrl = publicData?.publicUrl || null;
      }

      canDownload = Boolean(
        profile.allow_music_downloads &&
        track.allow_download &&
        audioUrl
      );
    }

    if (!audioUrl) {
      section.hidden = true;
      console.warn("Profile music is enabled, but no playable URL resolved.");
      return;
    }

    section.hidden = false;

    const player = createElement("div", "music-player");
    const title = createElement(
      "p",
      "music-title",
      track?.title || profile.profile_music_title || "Profile track"
    );

    const artist = createElement(
      "p",
      "music-artist",
      track?.artist || profile.profile_music_artist || ""
    );

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = audioUrl;
    audio.setAttribute("aria-label", `Play ${title.textContent}`);

    audio.addEventListener("error", () => {
      setActionStatus(
        "Music is saved, but the audio file could not be played. Check its storage access and format.",
        true
      );
    });

    player.append(title, artist, audio);

    if (canDownload) {
      const download = createElement("a", "music-download", "Download track");
      download.href = audioUrl;
      download.download = `${title.textContent}.mp3`;
      player.appendChild(download);
    }

    content.appendChild(player);
  }

  // --------------------------------------------------
  // Posts: rendering, editing and deleting
  // --------------------------------------------------

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function addPostStyles() {
    if ($("#grove-profile-post-styles")) return;

    const style = createElement("style");
    style.id = "grove-profile-post-styles";

    style.textContent = `
      .grove-profile-post {
        padding: 20px;
        border: 1px solid #851eff44;
        border-radius: 14px;
        background: #08051a;
        overflow-wrap: anywhere;
      }

      .grove-profile-post-date {
        margin: 0 0 12px;
        color: #a99bc9;
        font-size: 12px;
      }

      .grove-profile-post-body {
        margin: 0;
        color: #f7f5ff;
        line-height: 1.7;
        white-space: pre-wrap;
      }

      .grove-profile-post-media {
        display: block;
        width: 100%;
        max-height: 500px;
        margin-top: 14px;
        border-radius: 10px;
        object-fit: contain;
        background: #050019;
      }

      video.grove-profile-post-media {
        height: auto;
      }

      .grove-profile-post-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 16px;
      }

      .grove-profile-post-actions button {
        padding: 9px 13px;
        border: 1px solid #851eff66;
        border-radius: 8px;
        color: #eee5ff;
        background: #17102d;
        cursor: pointer;
      }

      .grove-profile-post-actions button:disabled {
        opacity: .5;
        cursor: wait;
      }

      .grove-profile-post-actions .delete-post {
        border-color: #ff858566;
        color: #ffb3bc;
      }

      .grove-profile-comments {
        display: grid;
        gap: 10px;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid #851eff33;
      }

      .grove-profile-comments-title {
        margin: 0 0 2px;
        color: #45e5ff;
        font-size: 13px;
      }

      .grove-profile-comment {
        padding: 10px 12px;
        border-radius: 9px;
        background: #111025;
        color: #d9d0ed;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
      }

      .grove-profile-comment-author {
        display: block;
        margin-bottom: 3px;
        color: #45e5ff;
        font-weight: 700;
      }

      .grove-profile-no-comments {
        color: #a99bc9;
        font-size: 13px;
      }
    `;

    document.head.appendChild(style);
  }

  async function editPost(post, article, bodyElement) {
    const updatedBody = window.prompt(
      "Edit your post:",
      post.body || ""
    );

    if (updatedBody === null) return;

    const { error } = await client
      .from("posts")
      .update({
        body: updatedBody.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", post.id)
      .eq("author_id", currentUser.id);

    if (error) {
      console.error("Post edit failed:", error);
      setActionStatus(error.message || "Could not edit this post.", true);
      return;
    }

    post.body = updatedBody.trim();

    if (post.body) {
      if (bodyElement) {
        bodyElement.textContent = post.body;
      } else {
        const newBody = createElement(
          "p",
          "grove-profile-post-body",
          post.body
        );

        article.insertBefore(newBody, article.children[1] || null);
      }
    } else if (bodyElement) {
      bodyElement.remove();
    }

    setActionStatus("Post updated.");
  }

  async function deletePost(post, article) {
    const confirmed = window.confirm(
      "Delete this post permanently? This cannot be undone."
    );

    if (!confirmed) return;

    const buttons = article.querySelectorAll("button");
    buttons.forEach((button) => {
      button.disabled = true;
    });

    const { error } = await client
      .from("posts")
      .delete()
      .eq("id", post.id)
      .eq("author_id", currentUser.id);

    if (error) {
      console.error("Post deletion failed:", error);
      buttons.forEach((button) => {
        button.disabled = false;
      });

      setActionStatus(error.message || "Could not delete this post.", true);
      return;
    }

    article.remove();
    setActionStatus("Post deleted.");

    const list = $("#posts-list");

    if (!list.querySelector(".grove-profile-post")) {
      list.replaceChildren(
        createElement("div", "empty-state", "This member hasn't posted anything yet.")
      );
    }
  }

  async function renderPostMedia(article, media) {
    const url = await resolveMedia(media);
    if (!url) return;

    const cleanUrl = url.split("?")[0].toLowerCase();
    const isVideo = /\.(mp4|webm|mov|m4v|ogv)$/.test(cleanUrl);

    if (isVideo) {
      const video = document.createElement("video");

      video.className = "grove-profile-post-media";
      video.src = url;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;

      article.appendChild(video);
    } else {
      const image = document.createElement("img");

      image.className = "grove-profile-post-media";
      image.src = url;
      image.alt = "Post image";
      image.loading = "lazy";

      article.appendChild(image);
    }
  }

  async function loadPosts() {
    const section = $("#posts-section");
    const list = $("#posts-list");

    section.hidden = false;
    list.replaceChildren(
      createElement("div", "empty-state", "Loading posts and comments…")
    );

    const { data: posts, error } = await client
      .from("posts")
      .select("id,author_id,body,media_urls,visibility,created_at")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Posts could not load:", error);

      list.replaceChildren(
        createElement(
          "div",
          "empty-state",
          "Posts couldn't be loaded. This may be a privacy restriction."
        )
      );

      return;
    }

    if (!posts?.length) {
      list.replaceChildren(
        createElement("div", "empty-state", "This member hasn't posted anything yet.")
      );

      return;
    }

    const postIds = posts.map((post) => post.id);

    const { data: comments, error: commentError } = await client
      .from("comments")
      .select("id,post_id,author_id,body,created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (commentError) {
      console.warn("Comments could not load:", commentError);
    }

    const safeComments = commentError ? [] : (comments || []);

    const authorIds = [
      ...new Set(safeComments.map((comment) => comment.author_id))
    ];

    let authors = new Map();

    if (authorIds.length) {
      const { data } = await client
        .from("profiles")
        .select("id,username,display_name")
        .in("id", authorIds);

      authors = new Map(
        (data || []).map((item) => [item.id, item])
      );
    }

    const byPost = new Map();

    safeComments.forEach((comment) => {
      if (!byPost.has(comment.post_id)) {
        byPost.set(comment.post_id, []);
      }

      byPost.get(comment.post_id).push(comment);
    });

    addPostStyles();
    list.replaceChildren();

    for (const post of posts) {
      const article = createElement("article", "grove-profile-post");

      const date = createElement(
        "p",
        "grove-profile-post-date",
        formatDate(post.created_at)
      );

      article.appendChild(date);

      let bodyElement = null;

      if (post.body?.trim()) {
        bodyElement = createElement(
          "p",
          "grove-profile-post-body",
          post.body
        );

        article.appendChild(bodyElement);
      }

      const mediaItems = Array.isArray(post.media_urls)
        ? post.media_urls
        : [];

      for (const media of mediaItems) {
        await renderPostMedia(article, media);
      }

      if (isOwner && currentUser?.id === post.author_id) {
        const actions = createElement("div", "grove-profile-post-actions");

        const editButton = createElement("button", "", "Edit post");
        editButton.type = "button";

        editButton.addEventListener("click", () => {
          editPost(post, article, bodyElement);
        });

        const deleteButton = createElement(
          "button",
          "delete-post",
          "Delete post"
        );

        deleteButton.type = "button";

        deleteButton.addEventListener("click", () => {
          deletePost(post, article);
        });

        actions.append(editButton, deleteButton);
        article.appendChild(actions);
      }

      const postComments = byPost.get(post.id) || [];
      const commentsBox = createElement("section", "grove-profile-comments");

      commentsBox.appendChild(
        createElement(
          "h3",
          "grove-profile-comments-title",
          `Comments (${postComments.length})`
        )
      );

      if (!postComments.length) {
        commentsBox.appendChild(
          createElement("p", "grove-profile-no-comments", "No comments yet.")
        );
      } else {
        postComments.forEach((comment) => {
          const row = createElement("div", "grove-profile-comment");
          const author = createElement("span", "grove-profile-comment-author");

          const authorProfile = authors.get(comment.author_id);

          author.textContent =
            authorProfile?.display_name ||
            (authorProfile?.username ? `@${authorProfile.username}` : "Grove Member");

          const text = createElement("span", "", comment.body);

          row.append(author, text);
          commentsBox.appendChild(row);
        });
      }

      article.appendChild(commentsBox);
      list.appendChild(article);
    }
  }

  // --------------------------------------------------
  // Initialization
  // --------------------------------------------------

  async function initialize() {
    // Bind these before network requests so the buttons are ready
    // as soon as the profile is displayed.
    bindImageButtons();

    if (!window.supabase?.createClient) {
      showError("Grove couldn't load. Please refresh.");
      return;
    }

    client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    try {
      const {
        data: sessionData,
        error: sessionError
      } = await client.auth.getSession();

      if (sessionError) throw sessionError;

      currentUser = sessionData.session?.user || null;

      const params = new URLSearchParams(window.location.search);

      const requestedUsername = params.get("username")?.trim();
      const requestedId = params.get("id")?.trim();

      let query = client
        .from("profiles")
        .select(
          "id,username,display_name,bio,avatar_url,cover_url,location,website,pronouns,is_private,profile_music_url,profile_music_title,profile_music_artist,profile_music_enabled,allow_music_downloads"
        );

      if (requestedId) {
        query = query.eq("id", requestedId);
      } else if (requestedUsername) {
        query = query.ilike(
          "username",
          requestedUsername.replace(/^@/, "")
        );
      } else if (currentUser) {
        query = query.eq("id", currentUser.id);
      } else {
        throw new Error(
          "Profile not specified. Open a member profile from Grove or sign in to view your own."
        );
      }

      const { data, error: profileError } = await query.maybeSingle();

      if (profileError) throw profileError;

      if (!data) {
        throw new Error("This Grove profile could not be found.");
      }

      profile = data;

      isOwner = Boolean(currentUser && currentUser.id === profile.id);

      $("#profile-card").hidden = false;
      $("#status").hidden = true;

      $("#edit-profile-link").hidden = !isOwner;
      $("#avatar-upload-button").hidden = !isOwner;
      $("#cover-upload-button").hidden = !isOwner;

      if (!isOwner && currentUser) {
        $("#follow-button").hidden = false;
        $("#message-button").hidden = false;

        $("#message-button").href =
          "community.html?to=" + encodeURIComponent(profile.id) + "#messages";

        await checkFollowState();
      } else {
        $("#follow-button").hidden = true;
        $("#message-button").hidden = true;
      }

      const canViewPrivate =
        isOwner || !profile.is_private || isAcceptedFollower;

      $("#private-note").hidden = canViewPrivate;

      await renderProfile(profile);

      const tasks = [loadRelationships()];

      if (canViewPrivate) {
        tasks.push(loadMusic(), loadPosts());
      } else {
        $("#music-section").hidden = true;
        $("#posts-section").hidden = true;
      }

      const results = await Promise.allSettled(tasks);

      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Profile section failed to load:", result.reason);
        }
      });

      if (!isOwner && !currentUser) {
        $("#follow-button").hidden = true;
        $("#message-button").hidden = true;
      }

      $("#follow-button").addEventListener("click", handleFollow);

    } catch (error) {
      console.error("Grove profile initialization failed:", error);

      showError(
        error?.message || "The profile could not be loaded. Please refresh."
      );

      $("#profile-card").hidden = true;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
