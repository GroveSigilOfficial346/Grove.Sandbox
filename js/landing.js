(() => {
  "use strict";

  const loginButton = document.getElementById("login-button");
  const joinButton = document.getElementById("join-button");
  const communityButton = document.getElementById("community-button");

  if (loginButton) {
    loginButton.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
  }

  if (joinButton) {
    joinButton.addEventListener("click", () => {
      window.location.href = "/login.html#register";
    });
  }

  if (communityButton) {
    communityButton.addEventListener("click", () => {
      window.location.href = "/community.html";
    });
  }
})();
