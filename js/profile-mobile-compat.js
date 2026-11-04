(() => {
  "use strict";

  const avatar = document.getElementById("avatar");
  const cover = document.getElementById("cover");

  if (!avatar) return;

  function prepareAvatar() {
    const image = avatar.querySelector("img");

    if (!image) return;

    // Profile pictures should load immediately, including on phones.
    image.loading = "eager";
    image.decoding = "async";

    if ("fetchPriority" in image) {
      image.fetchPriority = "high";
    }

    image.style.width = "100%";
    image.style.height = "100%";
    image.style.display = "block";
    image.style.objectFit = "cover";

    image.addEventListener("error", () => {
      image.remove();

      const name = document.getElementById("display-name")
        ?.textContent?.trim();

      avatar.textContent = name
        ? name.charAt(0).toUpperCase()
        : "G";
    }, { once: true });
  }

  // The profile renderer inserts the avatar asynchronously.
  prepareAvatar();

  const observer = new MutationObserver(() => {
    prepareAvatar();

    if (avatar.querySelector("img")) {
      observer.disconnect();
    }
  });

  observer.observe(avatar, {
    childList: true,
    subtree: true
  });

  // Keep cover images fitted consistently on narrow screens.
  if (cover) {
    cover.style.backgroundSize = "cover";
    cover.style.backgroundRepeat = "no-repeat";
    cover.style.backgroundPosition = "center";
  }
})();
