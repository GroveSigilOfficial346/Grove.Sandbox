(() => {
  "use strict";

  const client = window.groveClient;

  const elements = {
    username: document.getElementById("username"),
    displayName: document.getElementById("display-name"),
    avatar: document.getElementById("avatar"),
    postInput: document.getElementById("post-content"),
    postButton: document.getElementById("create-post"),
    feed: document.getElementById("feed"),
    logout: document.getElementById("logout"),
    feedbackInput: document.getElementById("feedback-content"),
    feedbackButton: document.getElementById("send-feedback"),
    message: document.getElementById("message")
  };

  let currentUser = null;
  let currentProfile = null;
  let feedChannel = null;

  function showMessage(text, isError = false) {
    if (!elements.message) return;

    elements.message.textContent = text;
    elements.message.style.color = isError ? "#ff8585" : "#05c9f4";
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function clearElement(element) {
    if (element) element.replaceChildren();
  }

  async function loadUser() {
    if (!client) {
      showMessage("Grove connection unavailable. Reload the page.", true);
      return false;
    }

    const { data, error } = await client.auth.getUser();

    if (error) throw error;

    if (!data.user) {
      window.location.replace("login.html");
      return false;
    }

    currentUser = data.user;

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile?.username) {
      window.location.replace("complete-profile.html");
      return false;
    }

    currentProfile = profile;

    if (elements.username) {
      elements.username.textContent = `@${profile.username}`;
    }

    if (elements.displayName) {
      elements.displayName.textContent =
        profile.display_name || profile.username;
    }

    if (elements.avatar) {
      if (profile.avatar_url) {
        elements.avatar.src = profile.avatar_url;
        elements.avatar.hidden = false;
      } else {
        elements.avatar.hidden = true;
      }
    }

    return true;
  }

  function renderPost(post, author) {
    const article = makeElement("article", "grove-post");
    article.dataset.postId = post.id;

    const header = makeElement("div", "post-header");
    const authorName = author?.display_name || author?.username || "Grove member";
    const username = author?.username ? `@${author.username}` : "";

    header.append(
      makeElement("strong", "post-author", authorName),
      makeElement("span", "post-username", username)
    );

    const body = makeElement("p", "post-body", post.body || "");
    const date = makeElement(
      "time",
      "post-date",
      post.created_at
        ? new Date(post.created_at).toLocaleString()
        : ""
    );

    article.append(header, body, date);

    if (post.author_id === currentUser.id) {
      const deleteButton = makeElement("button", "delete-post", "Delete");
      deleteButton.type = "button";

      deleteButton.addEventListener("click", () => {
        deletePost(post.id, article);
      });

      article.append(deleteButton);
    }

    return article;
  }

  async function loadFeed() {
    if (!elements.feed) return;

    const { data: posts, error } = await client
      .from("posts")
      .select("id, author_id, body, created_at, visibility")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    clearElement(elements.feed);

    if (!posts?.length) {
      elements.feed.append(
        makeElement("p", "empty-feed", "No posts yet. Start the conversation.")
      );
      return;
    }

    const authorIds = [...new Set(posts.map(post => post.author_id))];

    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, username, display_name")
      .in("id", authorIds);

    if (profilesError) throw profilesError;

    const profileMap = new Map(
      (profiles || []).map(profile => [profile.id, profile])
    );

    for (const post of posts) {
      elements.feed.append(
        renderPost(post, profileMap.get(post.author_id))
      );
    }
  }

  async function createPost() {
    if (!elements.postInput || !elements.postButton) return;

    const body = elements.postInput.value.trim();

    if (!body) {
      showMessage("Write something before posting.", true);
      return;
    }

    if (body.length > 5000) {
      showMessage("Posts must be 5,000 characters or fewer.", true);
      return;
    }

    elements.postButton.disabled = true;
    showMessage("Publishing post...");

    try {
      const { error } = await client
        .from("posts")
        .insert({
          author_id: currentUser.id,
          body,
          visibility: "public"
        });

      if (error) throw error;

      elements.postInput.value = "";
      showMessage("Your post has been published.");

      await loadFeed();

    } catch (error) {
      console.error("Post creation failed:", error);
      showMessage(error.message || "Could not publish your post.", true);

    } finally {
      elements.postButton.disabled = false;
    }
  }

  async function deletePost(postId, article) {
    if (!window.confirm("Delete this post?")) return;

    try {
      const { error } = await client
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("author_id", currentUser.id);

      if (error) throw error;

      article.remove();
      showMessage("Post deleted.");

    } catch (error) {
      console.error("Post deletion failed:", error);
      showMessage(error.message || "Could not delete the post.", true);
    }
  }

  async function sendFeedback() {
    if (!elements.feedbackInput || !elements.feedbackButton) return;

    const content = elements.feedbackInput.value.trim();

    if (!content) {
      showMessage("Enter feedback before sending.", true);
      return;
    }

    elements.feedbackButton.disabled = true;
    showMessage("Sending feedback...");

    try {
      const { error } = await client
        .from("feedback")
        .insert({
          user_id: currentUser.id,
          content
        });

      if (error) throw error;

      elements.feedbackInput.value = "";
      showMessage("Feedback sent. Thank you.");

    } catch (error) {
      console.error("Feedback submission failed:", error);
      showMessage(error.message || "Could not send feedback.", true);

    } finally {
      elements.feedbackButton.disabled = false;
    }
  }

  async function logout() {
    if (!client) return;

    const { error } = await client.auth.signOut();

    if (error) {
      showMessage(error.message || "Could not sign out.", true);
      return;
    }

    window.location.replace("login.html");
  }

  function subscribeToFeed() {
    if (feedChannel) {
      client.removeChannel(feedChannel);
    }

    feedChannel = client
      .channel("grove-public-feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "posts"
        },
        () => {
          loadFeed().catch(error => {
            console.error("Live feed refresh failed:", error);
          });
        }
      )
      .subscribe();
  }

  async function initialize() {
    try {
      const authenticated = await loadUser();

      if (!authenticated) return;

      if (elements.postButton) {
        elements.postButton.addEventListener("click", createPost);
      }

      if (elements.feedbackButton) {
        elements.feedbackButton.addEventListener("click", sendFeedback);
      }

      if (elements.logout) {
        elements.logout.addEventListener("click", logout);
      }

      await loadFeed();
      subscribeToFeed();

    } catch (error) {
      console.error("Grove dashboard initialization failed:", error);
      showMessage(error.message || "Could not load your dashboard.", true);
    }
  }

  initialize();
})();
