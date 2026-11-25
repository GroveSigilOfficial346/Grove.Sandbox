// Grove local-device inactivity lock.
// Signs out this browser's local session after 15 minutes of inactivity.
// Other devices remain signed in.

const ACTIVITY_KEY = "grove:last-activity";
const DEFAULT_TIMEOUT = 15 * 60 * 1000;

export function installInactivityLock(supabase, {
  timeoutMs = DEFAULT_TIMEOUT,
  onLock = () => {}
} = {}) {
  let timer = null;
  let sessionPresent = false;
  let locked = false;
  let lastActivity = 0;
  let lastWrite = 0;

  function readActivity() {
    try {
      return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function writeActivity(timestamp) {
    try {
      localStorage.setItem(ACTIVITY_KEY, String(timestamp));
      lastWrite = timestamp;
    } catch {
      // The in-memory timer remains active.
    }
  }

  function clearActivity() {
    try {
      localStorage.removeItem(ACTIVITY_KEY);
    } catch {}
  }

  function stopTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  async function lockSession() {
    if (locked || !sessionPresent) return;

    locked = true;
    sessionPresent = false;
    stopTimer();
    clearActivity();

    await supabase.auth.signOut({ scope: "local" });
    onLock();
  }

  function scheduleLock() {
    stopTimer();

    if (!sessionPresent || locked) return;

    const storedActivity = readActivity();
    lastActivity = Math.max(lastActivity, storedActivity);

    if (!lastActivity) {
      lastActivity = Date.now();
      writeActivity(lastActivity);
    }

    const remaining =
      timeoutMs - (Date.now() - lastActivity);

    if (remaining <= 0) {
      void lockSession();
      return;
    }

    timer = window.setTimeout(() => {
      if (Date.now() - lastActivity >= timeoutMs) {
        void lockSession();
      } else {
        scheduleLock();
      }
    }, remaining);
  }

  function recordActivity() {
    if (!sessionPresent || locked) return;

    lastActivity = Date.now();

    // Limit storage writes while preserving accurate activity timing.
    if (lastActivity - lastWrite >= 5000) {
      writeActivity(lastActivity);
    }

    scheduleLock();
  }

  const activityEvents = [
    "pointerdown",
    "pointermove",
    "keydown",
    "scroll",
    "touchstart"
  ];

  for (const eventName of activityEvents) {
    window.addEventListener(
      eventName,
      recordActivity,
      { passive: true }
    );
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleLock();
  });

  window.addEventListener("focus", scheduleLock);

  window.addEventListener("storage", (event) => {
    if (event.key === ACTIVITY_KEY && sessionPresent && !locked) {
      lastActivity = Math.max(lastActivity, readActivity());
      scheduleLock();
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (
      event === "SIGNED_IN" ||
      event === "PASSWORD_RECOVERY"
    ) {
      sessionPresent = Boolean(session);
      locked = false;

      if (sessionPresent) {
        lastActivity = Date.now();
        writeActivity(lastActivity);
        scheduleLock();
      }

      return;
    }

    if (event === "INITIAL_SESSION") {
      sessionPresent = Boolean(session);

      if (sessionPresent) {
        locked = false;
        lastActivity = readActivity();
        scheduleLock();
      }

      return;
    }

    if (event === "SIGNED_OUT") {
      sessionPresent = false;
      locked = true;
      stopTimer();
      clearActivity();
    }
  });

  return {
    recordActivity,
    lockNow: lockSession
  };
}
