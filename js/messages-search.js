(() => {
  "use strict";

  const messageList = document.querySelector("#message-list");
  const chatPanel = document.querySelector(".chat-panel");

  if (!messageList || !chatPanel) return;

  const state = {
    matches: [],
    activeIndex: -1,
    query: ""
  };

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createSearchBar() {
    const existing = document.querySelector("#grove-message-search");
    if (existing) return existing;

    const bar = createElement("section", "grove-message-search");
    bar.id = "grove-message-search";
    bar.setAttribute("aria-label", "Search this conversation");

    const input = document.createElement("input");
    input.type = "search";
    input.id = "grove-message-search-input";
    input.placeholder = "Search messages in this conversation...";
    input.autocomplete = "off";
    input.maxLength = 200;
    input.setAttribute("aria-label", "Search messages");

    const count = createElement(
      "span",
      "grove-message-search-count",
      "Search loaded messages"
    );
    count.id = "grove-message-search-count";
    count.setAttribute("aria-live", "polite");

    const previous = createElement("button", "", "↑");
    previous.type = "button";
    previous.className = "grove-message-search-step";
    previous.title = "Previous match";
    previous.setAttribute("aria-label", "Previous match");

    const next = createElement("button", "", "↓");
    next.type = "button";
    next.className = "grove-message-search-step";
    next.title = "Next match";
    next.setAttribute("aria-label", "Next match");

    const clear = createElement("button", "", "Clear");
    clear.type = "button";
    clear.className = "grove-message-search-clear";

    bar.append(input, count, previous, next, clear);

    const heading = chatPanel.querySelector(".chat-heading");
    if (heading) {
      heading.insertAdjacentElement("afterend", bar);
    } else {
      chatPanel.insertBefore(bar, messageList);
    }

    input.addEventListener("input", () => {
      state.query = input.value.trim();
      findMatches();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        moveMatch(event.shiftKey ? -1 : 1);
      }

      if (event.key === "Escape") {
        clearSearch();
      }
    });

    previous.addEventListener("click", () => moveMatch(-1));
    next.addEventListener("click", () => moveMatch(1));
    clear.addEventListener("click", clearSearch);

    return bar;
  }

  function getSearchInput() {
    return document.querySelector("#grove-message-search-input");
  }

  function getCount() {
    return document.querySelector("#grove-message-search-count");
  }

  function removeHighlights() {
    messageList
      .querySelectorAll(".grove-message-search-match")
      .forEach((article) => {
        article.classList.remove("grove-message-search-match");
        article.classList.remove("grove-message-search-active");
      });
  }

  function findMatches() {
    removeHighlights();

    state.matches = [];
    state.activeIndex = -1;

    const query = state.query.toLocaleLowerCase();

    if (!query) {
      updateCount("Search loaded messages");
      return;
    }

    const articles = [
      ...messageList.querySelectorAll(
        ".message-bubble[data-message-id]"
      )
    ];

    for (const article of articles) {
      if (article.classList.contains("message-unsent-placeholder")) {
        continue;
      }

      const paragraph = article.querySelector("p");
      const body = paragraph?.textContent || "";

      if (body.toLocaleLowerCase().includes(query)) {
        article.classList.add("grove-message-search-match");
        state.matches.push(article);
      }
    }

    if (!state.matches.length) {
      updateCount("No matches in loaded messages");
      return;
    }

    state.activeIndex = 0;
    showActiveMatch();
  }

  function updateCount(message) {
    const count = getCount();
    if (!count) return;

    if (message) {
      count.textContent = message;
      return;
    }

    if (!state.matches.length) {
      count.textContent = "No matches";
      return;
    }

    count.textContent =
      `${state.activeIndex + 1} of ${state.matches.length}`;
  }

  function showActiveMatch() {
    if (!state.matches.length || state.activeIndex < 0) {
      updateCount();
      return;
    }

    state.matches.forEach((article) => {
      article.classList.remove("grove-message-search-active");
    });

    const article = state.matches[state.activeIndex];

    article.classList.add("grove-message-search-active");

    article.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    updateCount();
  }

  function moveMatch(direction) {
    if (!state.matches.length) return;

    state.activeIndex += direction;

    if (state.activeIndex < 0) {
      state.activeIndex = state.matches.length - 1;
    }

    if (state.activeIndex >= state.matches.length) {
      state.activeIndex = 0;
    }

    showActiveMatch();
  }

  function clearSearch() {
    const input = getSearchInput();

    if (input) input.value = "";

    state.query = "";
    state.matches = [];
    state.activeIndex = -1;

    removeHighlights();
    updateCount("Search loaded messages");
  }

  createSearchBar();

  const observer = new MutationObserver(() => {
    if (state.query) {
      findMatches();
    }
  });

  observer.observe(messageList, {
    childList: true,
    subtree: true
  });

  window.addEventListener("beforeunload", () => {
    observer.disconnect();
  });
})();
