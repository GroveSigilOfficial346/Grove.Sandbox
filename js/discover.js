import { supabase } from "./supabase.js";

const MAX_RESULTS = 20;
const SEARCH_DELAY = 220;

const input = document.getElementById("member-search");
const clearButton = document.getElementById("clear-search");
const resultsContainer = document.getElementById("member-results");
const statusElement = document.getElementById("discover-status");
const countElement = document.getElementById("result-count");

let currentUser = null;
let searchTimer = null;
let searchSequence = 0;

function setStatus(message, isError = false) {
  statusElement.textContent = message || "";
  statusElement.classList.toggle("error", isError);
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  return node;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function profileUrl(id) {
  return "/profile.html?id=" + encodeURIComponent(id);
}

function memberName(member) {
  return member.display_name?.trim() ||
    (member.username ? "@" + member.username : "Grove Member");
}

function renderAvatar(member) {
  const avatar = createElement("span", "member-avatar");
  const url = member.avatar_url;

  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";

    image.addEventListener("error", () => {
      avatar.replaceChildren(
        document.createTextNode(memberName(member).charAt(0).toUpperCase())
      );
    }, { once: true });

    avatar.append(image);
  } else {
    avatar.textContent = memberName(member).charAt(0).toUpperCase();
  }

  return avatar;
}

async function loadRelationshipStates(members) {
  const states = new Map();

  if (!currentUser || !members.length) return states;

  const ids = members
    .filter(member => member.id !== currentUser.id)
    .map(member => member.id);

  if (!ids.length) return states;

  const [followsResult, requestsResult] = await Promise.all([
    supabase
      .from("follows")
      .select("following_id,status")
      .eq("follower_id", currentUser.id)
      .in("following_id", ids),

    supabase
      .from("follow_requests")
      .select("target_id,status")
      .eq("requester_id", currentUser.id)
      .eq("status", "pending")
      .in("target_id", ids)
  ]);

  if (followsResult.error) throw followsResult.error;
  if (requestsResult.error) throw requestsResult.error;

  for (const row of followsResult.data || []) {
    if (row.status === "accepted") {
      states.set(row.following_id, "following");
    }
  }

  for (const row of requestsResult.data || []) {
    states.set(row.target_id, "pending");
  }

  return states;
}

function makeActionButton(member, state) {
  const button = createElement(
    "button",
    "member-follow-button",
    state === "following"
      ? "Following"
      : state === "pending"
        ? "Requested"
        : "Follow"
  );

  button.type = "button";

  if (state === "following") {
    button.classList.add("following");
  } else if (state === "pending") {
    button.classList.add("pending");
  }

  button.addEventListener("click", () => {
    updateRelationship(member, button, state);
  });

  return button;
}

function renderMember(member, relationshipState) {
  const card = createElement("article", "member-card");
  const info = createElement("div", "member-info");

  const name = createElement("span", "member-name", memberName(member));
  const username = createElement(
    "span",
    "member-username",
    member.username ? "@" + member.username : ""
  );

  info.append(name, username);

  if (member.is_private) {
    info.append(
      createElement("span", "member-privacy", "Private account")
    );
  }

  const actions = createElement("div", "member-actions");

  const profileLink = createElement(
    "a",
    "member-profile-link",
    "View profile"
  );
  profileLink.href = profileUrl(member.id);

  actions.append(profileLink);

  if (currentUser && member.id !== currentUser.id) {
    actions.append(makeActionButton(member, relationshipState));
  }

  card.append(renderAvatar(member), info, actions);

  return card;
}

async function updateRelationship(member, button, currentState) {
  if (!currentUser) {
    window.location.href = "/login.html";
    return;
  }

  button.disabled = true;
  button.textContent = "Updating...";

  try {
    if (currentState === "pending") {
      const { error } = await supabase
        .from("follow_requests")
        .delete()
        .eq("requester_id", currentUser.id)
        .eq("target_id", member.id)
        .eq("status", "pending");

      if (error) throw error;

    } else if (currentState === "following") {
      if (member.is_private) {
        const { error: requestError } = await supabase
          .from("follow_requests")
          .delete()
          .eq("requester_id", currentUser.id)
          .eq("target_id", member.id)
          .eq("status", "accepted");

        if (requestError) throw requestError;
      }

      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", member.id);

      if (error) throw error;

    } else if (member.is_private) {
      const { error } = await supabase
        .from("follow_requests")
        .insert({
          requester_id: currentUser.id,
          target_id: member.id
        });

      if (error) throw error;

    } else {
      const { error } = await supabase
        .from("follows")
        .insert({
          follower_id: currentUser.id,
          following_id: member.id,
          status: "accepted"
        });

      if (error) throw error;
    }

    await performSearch(input.value);

  } catch (error) {
    console.error("Member follow action failed:", error);

    const message = String(error?.message || "");

    if (
      message.includes("notifications_kind_check") ||
      message.includes("follow_request")
    ) {
      setStatus(
        "The follow request was blocked by the notification database constraint. Apply the notification SQL fix supplied with this update, then try again.",
        true
      );
    } else {
      setStatus(message || "Could not update this follow status.", true);
    }

    button.disabled = false;
    button.textContent =
      currentState === "following"
        ? "Following"
        : currentState === "pending"
          ? "Requested"
          : "Follow";
  }
}

async function searchDirectory(term) {
  const pattern = "%" + escapeLike(term) + "%";

  const [nameResult, usernameResult] = await Promise.all([
    supabase
      .from("profile_directory")
      .select("id,username,display_name,avatar_url,is_private")
      .ilike("display_name", pattern)
      .limit(MAX_RESULTS),

    supabase
      .from("profile_directory")
      .select("id,username,display_name,avatar_url,is_private")
      .ilike("username", pattern)
      .limit(MAX_RESULTS)
  ]);

  if (nameResult.error) throw nameResult.error;
  if (usernameResult.error) throw usernameResult.error;

  const unique = new Map();

  for (const member of [
    ...(nameResult.data || []),
    ...(usernameResult.data || [])
  ]) {
    unique.set(member.id, member);
  }

  const lower = term.toLowerCase();

  return [...unique.values()]
    .filter(member => member.id !== currentUser?.id)
    .sort((a, b) => {
      const aName = (a.display_name || "").toLowerCase();
      const bName = (b.display_name || "").toLowerCase();
      const aUsername = (a.username || "").toLowerCase();
      const bUsername = (b.username || "").toLowerCase();

      const aStarts = aName.startsWith(lower) || aUsername.startsWith(lower);
      const bStarts = bName.startsWith(lower) || bUsername.startsWith(lower);

      return Number(bStarts) - Number(aStarts);
    })
    .slice(0, MAX_RESULTS);
}

async function performSearch(rawTerm) {
  const term = rawTerm.trim();
  const sequence = ++searchSequence;

  resultsContainer.replaceChildren();
  countElement.textContent = "";

  if (!term) {
    setStatus("Start typing to discover members.");
    return;
  }

  setStatus("Searching members...");

  try {
    const members = await searchDirectory(term);

    if (sequence !== searchSequence) return;

    if (!members.length) {
      setStatus("No members matched that search.");
      return;
    }

    const states = await loadRelationshipStates(members);

    if (sequence !== searchSequence) return;

    resultsContainer.replaceChildren();

    for (const member of members) {
      resultsContainer.append(
        renderMember(member, states.get(member.id) || "none")
      );
    }

    countElement.textContent =
      members.length + (members.length === 1 ? " member" : " members");

    setStatus("");

  } catch (error) {
    if (sequence !== searchSequence) return;

    console.error("Member search failed:", error);
    setStatus(
      error.message || "Could not search members. Try again.",
      true
    );
  }
}

function scheduleSearch() {
  window.clearTimeout(searchTimer);

  searchTimer = window.setTimeout(() => {
    performSearch(input.value);
  }, SEARCH_DELAY);
}

async function initialize() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.warn("Could not resolve signed-in user:", error);
  }

  currentUser = data?.user || null;

  input.addEventListener("input", scheduleSearch);

  clearButton.addEventListener("click", () => {
    input.value = "";
    input.focus();
    performSearch("");
  });

  const initialTerm = new URLSearchParams(window.location.search).get("q");

  if (initialTerm) {
    input.value = initialTerm.slice(0, 60);
    performSearch(input.value);
  }
}

initialize();
