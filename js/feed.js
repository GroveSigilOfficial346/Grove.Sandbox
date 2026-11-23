(function () {
  const client = window.supabaseClient;

  const composer = document.getElementById("composer");
  const postForm = document.getElementById("post-form");
  const postBody = document.getElementById("post-body");
  const visibility = document.getElementById("post-visibility");

  const publishButton = document.getElementById("publish-button");
  const refreshButton = document.getElementById("refresh-button");
  const logoutButton = document.getElementById("logout-button");

  const composerStatus = document.getElementById("composer-status");
  const feedStatus = document.getElementById("feed-status");
  const postList = document.getElementById("post-list");

  let currentUser = null;

  function status(element, message, type) {
    element.textContent = message;
    element.dataset.type = type || "info";
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function makeButton(text, className, action) {
    const button = makeElement("button", className, text);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }

  function formatDate(value) {
    const date = new Date(value);

    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  async function loadFeed() {
    status(feedStatus, "Loading posts...", "info");
    postList.replaceChildren();

    try {
      const { data: posts, error: postError } = await client
        .from("posts")
        .select("id, author_id, body, visibility, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (postError) throw postError;

      if (!posts || posts.length === 0) {
        status(feedStatus, "", "info");
        postList.appendChild(
          makeElement(
            "div",
            "empty-state",
            "No posts yet. Be the first to share something with Grove."
          )
        );
        return;
      }

      const authorIds = [...new Set(posts.map(post => post.author_id))];
      const postIds = posts.map(post => post.id);

      const [profileResult, likesResult, commentsResult] =
        await Promise.all([
          client
            .from("profiles")
            .select("id, username, display_name")
            .in("id", authorIds),

          client
            .from("post_likes")
            .select("post_id, user_id")
            .in("post_id", postIds),

          client
            .from("post_comments")
            .select("id, post_id, author_id, body, created_at")
            .in("post_id", postIds)
            .order("created_at", { ascending: true })
        ]);

      if (profileResult.error) throw profileResult.error;
      if (likesResult.error) throw likesResult.error;
      if (commentsResult.error) throw commentsResult.error;

      const profiles = new Map(
        (profileResult.data || []).map(profile => [
          profile.id,
          profile
        ])
      );

      const likes = likesResult.data || [];
      const comments = commentsResult.data || [];

      const commentAuthorIds = [
        ...new Set(comments.map(comment => comment.author_id))
      ];

      let commentProfiles = new Map();

      if (commentAuthorIds.length) {
        const { data, error } = await client
          .from("profiles")
          .select("id, username, display_name")
          .in("id", commentAuthorIds);

        if (error) throw error;

        commentProfiles = new Map(
          (data || []).map(profile => [profile.id, profile])
        );
      }

      status(feedStatus, "", "info");

      posts.forEach(post => {
        const author = profiles.get(post.author_id);
        const postLikes = likes.filter(like => like.post_id === post.id);
        const postComments = comments.filter(
          comment => comment.post_id === post.id
        );

        const likedByMe = currentUser
          ? postLikes.some(like => like.user_id === currentUser.id)
          : false;

        renderPost({
          post,
          author,
          postLikes,
          postComments,
          commentProfiles,
          likedByMe
        });
      });
    } catch (error) {
      console.error("Grove feed error:", error);

      status(
        feedStatus,
        error.message || "Could not load the feed.",
        "error"
      );
    }
  }

  function renderPost(data) {
    const {
      post,
      author,
      postLikes,
      postComments,
      commentProfiles,
      likedByMe
    } = data;

    const card = makeElement("article", "post-card");
    const header = makeElement("div", "post-header");
    const authorBlock = makeElement("div", "author-block");

    const name = author
      ? author.display_name || author.username
      : "Grove Member";

    const username = author && author.username
      ? "@" + author.username
      : "";

    authorBlock.appendChild(
      makeElement("div", "author-name", name)
    );

    authorBlock.appendChild(
      makeElement("div", "author-username", username)
    );

    const dateBlock = makeElement("div", "post-date", formatDate(post.created_at));

    header.append(authorBlock, dateBlock);
    card.appendChild(header);

    card.appendChild(
      makeElement("div", "post-visibility", post.visibility)
    );

    card.appendChild(
      makeElement("div", "post-body", post.body || "")
    );

    const actions = makeElement("div", "post-actions");

    const likeButton = makeButton(
      (likedByMe ? "LIKED" : "LIKE") +
        " · " + postLikes.length,
      likedByMe ? "action-button liked" : "action-button",
      () => toggleLike(post.id)
    );

    actions.appendChild(likeButton);

    actions.appendChild(
      makeElement(
        "span",
        "comment-count",
        postComments.length + " comments"
      )
    );

    if (currentUser && currentUser.id === post.author_id) {
      actions.appendChild(
        makeButton(
          "DELETE",
          "action-button delete-button",
          () => deletePost(post.id)
        )
      );
    }

    card.appendChild(actions);

    const commentsSection = makeElement("section", "comments");

    postComments.forEach(comment => {
      const commentAuthor = commentProfiles.get(comment.author_id);
      const commentName = commentAuthor
        ? commentAuthor.display_name || commentAuthor.username
        : "Grove Member";

      const commentLine = makeElement("p", "comment");
      const strong = makeElement("strong", "", commentName);

      commentLine.append(
        strong,
        document.createTextNode(comment.body)
      );

      commentsSection.appendChild(commentLine);
    });

    if (currentUser) {
      const commentForm = makeElement("form", "comment-form");
      const commentInput = document.createElement("input");

      commentInput.type = "text";
      commentInput.maxLength = 1000;
      commentInput.placeholder = "Write a comment...";
      commentInput.required = true;

      const commentButton = document.createElement("button");
      commentButton.type = "submit";
      commentButton.textContent = "COMMENT";

      commentForm.append(commentInput, commentButton);

      commentForm.addEventListener("submit", async event => {
        event.preventDefault();

        const body = commentInput.value.trim();
        if (!body) return;

        commentButton.disabled = true;

        try {
          const { error } = await client
            .from("post_comments")
            .insert({
              post_id: post.id,
              author_id: currentUser.id,
              body
            });

          if (error) throw error;

          await loadFeed();
        } catch (error) {
          console.error("Grove comment error:", error);
          alert(error.message || "Could not publish comment.");
          commentButton.disabled = false;
        }
      });

      commentsSection.appendChild(commentForm);
    }

    card.appendChild(commentsSection);
    postList.appendChild(card);
  }

  async function createPost(event) {
    event.preventDefault();

    if (!currentUser) {
      status(composerStatus, "Log in to publish a post.", "error");
      return;
    }

    const body = postBody.value.trim();

    if (!body) {
      status(composerStatus, "Write something before publishing.", "error");
      return;
    }

    publishButton.disabled = true;
    publishButton.textContent = "PUBLISHING...";

    try {
      const { error } = await client
        .from("posts")
        .insert({
          author_id: currentUser.id,
          body,
          visibility: visibility.value
        });

      if (error) throw error;

      postBody.value = "";
      visibility.value = "public";

      status(composerStatus, "Your post is live.", "success");
      await loadFeed();
    } catch (error) {
      console.error("Grove post error:", error);

      status(
        composerStatus,
        error.message || "Could not publish your post.",
        "error"
      );
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = "PUBLISH";
    }
  }

  async function toggleLike(postId) {
    if (!currentUser) return;

    try {
      const { data: existing, error: findError } = await client
        .from("post_likes")
        .select("post_id")
        .eq("post_id", postId)
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (findError) throw findError;

      if (existing) {
        const { error } = await client
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", currentUser.id);

        if (error) throw error;
      } else {
        const { error } = await client
          .from("post_likes")
          .insert({
            post_id: postId,
            user_id: currentUser.id
          });

        if (error) throw error;
      }

      await loadFeed();
    } catch (error) {
      console.error("Grove like error:", error);
      alert(error.message || "Could not update like.");
    }
  }

  async function deletePost(postId) {
    if (!currentUser) return;

    if (!window.confirm("Delete this post? This cannot be undone.")) {
      return;
    }

    try {
      const { error } = await client
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("author_id", currentUser.id);

      if (error) throw error;

      await loadFeed();
    } catch (error) {
      console.error("Grove delete error:", error);
      alert(error.message || "Could not delete post.");
    }
  }

  async function initialize() {
    try {
      const { data, error } = await client.auth.getUser();

      if (error) throw error;

      currentUser = data.user;

      if (currentUser) {
        composer.hidden = false;
        logoutButton.hidden = false;
      }
    } catch (error) {
      console.error("Grove auth check:", error);
      status(feedStatus, error.message, "error");
    }

    await loadFeed();
  }

  postForm.addEventListener("submit", createPost);

  refreshButton.addEventListener("click", loadFeed);

  logoutButton.addEventListener("click", async function () {
    logoutButton.disabled = true;

    try {
      await window.GROVE_AUTH.signOut();
      window.location.href = "index.html";
    } catch (error) {
      alert(error.message || "Logout failed.");
      logoutButton.disabled = false;
    }
  });

  initialize();
})();
