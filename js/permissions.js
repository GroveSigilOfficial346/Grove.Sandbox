(() => {
  "use strict";

  const client = window.groveClient;

  const ROLE_LEVELS = {
    member: 0,
    moderator: 1,
    admin: 2,
    owner: 3
  };

  async function getCurrentUser() {
    if (!client) {
      throw new Error("Grove connection is unavailable.");
    }

    const { data, error } = await client.auth.getUser();

    if (error) throw error;

    return data.user || null;
  }

  async function getRole(userId) {
    if (!userId) return "member";

    const { data, error } = await client
      .from("grove_admins")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    return ROLE_LEVELS[data?.role] !== undefined
      ? data.role
      : "member";
  }

  async function getPermissions() {
    const user = await getCurrentUser();

    if (!user) {
      return {
        authenticated: false,
        user: null,
        role: "guest",
        level: -1,
        isModerator: false,
        isAdmin: false,
        isOwner: false
      };
    }

    const role = await getRole(user.id);
    const level = ROLE_LEVELS[role];

    return {
      authenticated: true,
      user,
      role,
      level,
      isModerator: level >= ROLE_LEVELS.moderator,
      isAdmin: level >= ROLE_LEVELS.admin,
      isOwner: level >= ROLE_LEVELS.owner
    };
  }

  async function hasRole(requiredRole) {
    if (!(requiredRole in ROLE_LEVELS)) {
      throw new Error("Unknown Grove role.");
    }

    const permissions = await getPermissions();

    return permissions.level >= ROLE_LEVELS[requiredRole];
  }

  async function requireRole(requiredRole) {
    const allowed = await hasRole(requiredRole);

    if (!allowed) {
      window.location.replace("user-dashboard.html");
      return false;
    }

    return true;
  }

  window.GrovePermissions = Object.freeze({
    getCurrentUser,
    getRole,
    getPermissions,
    hasRole,
    requireRole
  });
})();
