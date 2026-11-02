console.log("Grove dashboard controller loaded");

const usernameDisplay = document.getElementById("username");
const emailDisplay = document.getElementById("user-email");
const logoutButton = document.getElementById("logout");

const postContent = document.getElementById("post-content");
const createPostButton = document.getElementById("create-post");
const postMessage = document.getElementById("post-message");
const feed = document.getElementById("feed");

const sendSuggestionButton =
  document.getElementById("send-suggestion");

const suggestionMessage =
  document.getElementById("suggestion-message");

let currentUser = null;

function setMessage(element, text, color = "#8f9893") {
  if (!element) return;

  element.textContent = text;
  element.style.color = color;
}

function makeTextElement(tag, text, className) {
  const element = document.createElement(tag);

  element.textContent = text ?? "";

  if (className) {
    element.className = className;
  }

  return element;
}

async function checkUser() {
  const { data, error } =
    await window.groveClient.auth.getSession();

  if (error || !data.session) {
    window.location.replace("login.html");
    return;
  }

  currentUser = data.session.user;

  const { data: profile, error: profileError } =
    await window.groveClient
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", currentUser.id)
      .maybeSingle();

  if (profileError) {
    console.error("Grove profile load:", profileError);

    usernameDisplay.textContent =
      "Profile could not be loaded";

    return;
  }

  if (!profile) {
    window.location.replace("complete-profile.html");
    return;
  }

  usernameDisplay.textContent =
    profile.display_name ||
    profile.username ||
    "Welcome to Grove";

  emailDisplay.textContent = currentUser.email || "";

  await window.groveClient
    .from("profiles")
    .update({
      last_seen_at: new Date().toISOString()
    })
    .eq("id", currentUser.id);

  await loadPosts();
}

async function createPost() {
  const body = postContent.value.trim();

  if (!body) {
    setMessage(
      postMessage,
      "Write something first.",
      "#ff7777"
    );

    return;
  }

  createPostButton.disabled = true;
  setMessage(postMessage, "Publishing...");

  const { error } =
    await window.groveClient
      .from("posts")
      .insert({
        author_id: currentUser.id,
        body,
        visibility: "public"
      });

  createPostButton.disabled = false;

  if (error) {
    console.error("Grove post:", error);

    setMessage(
      postMessage,
      error.message,
      "#ff7777"
    );

    return;
  }

  postContent.value = "";

  setMessage(
    postMessage,
    "Posted to Grove.",
    "#7bd7a2"
  );

  await loadPosts();
}

async function loadPosts() {
  feed.replaceChildren(
    makeTextElement("p", "Loading Grove feed...")
  );

  const { data: posts, error } =
    await window.groveClient
      .from("posts")
      .select("id, author_id, body, created_at")
      .order("created_at", {
        ascending: false
      })
      .limit(50);

  if (error) {
    console.error("Grove feed:", error);

    feed.replaceChildren(
      makeTextElement(
        "p",
        "Unable to load the feed: " + error.message
      )
    );

    return;
  }

  if (!posts?.length) {
    feed.replaceChildren(
      makeTextElement(
        "p",
        "No posts yet. Be the first to post."
      )
    );

    return;
  }

  const authorIds = [
    ...new Set(posts.map(post => post.author_id))
  ];

  const { data: profiles, error: profilesError } =
    await window.groveClient
      .from("profiles")
      .select("id, username, display_name")
      .in("id", authorIds);

  if (profilesError) {
    console.warn(
      "Grove author profiles:",
      profilesError
    );
  }

  const profileById = new Map(
    (profiles || []).map(profile => [
      profile.id,
      profile
    ])
  );

  feed.replaceChildren();

  for (const post of posts) {
    const author = profileById.get(post.author_id);

    const card = document.createElement("article");
    card.className = "post";

    card.appendChild(
      makeTextElement(
        "strong",
        author?.display_name ||
        author?.username ||
        "Grove member"
      )
    );

    card.appendChild(
      makeTextElement("p", post.body)
    );

    card.appendChild(
      makeTextElement(
        "p",
        new Date(post.created_at).toLocaleString(),
        "post-time"
      )
    );

    if (post.author_id === currentUser.id) {
      const removeButton =
        makeTextElement("button", "Delete");

      removeButton.type = "button";

      removeButton.addEventListener(
        "click",
        () => deletePost(post.id)
      );

      card.appendChild(removeButton);
    }

    feed.appendChild(card);
  }
}

async function deletePost(postId) {
  if (!confirm("Delete this post?")) return;

  const { error } =
    await window.groveClient
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("author_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadPosts();
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  const { error } =
    await window.groveClient.auth.signOut();

  if (error) {
    console.error("Grove logout:", error);
    alert(error.message);
    logoutButton.disabled = false;
    return;
  }

  window.location.replace("index.html");
});

createPostButton.addEventListener(
  "click",
  createPost
);

if (sendSuggestionButton) {
  sendSuggestionButton.disabled = true;

  sendSuggestionButton.title =
    "Suggestion submissions are not connected to a database table yet.";

  sendSuggestionButton.textContent =
    "Suggestions coming soon";

  setMessage(
    suggestionMessage,
    "The suggestion box is not connected yet."
  );
}

checkUser();
