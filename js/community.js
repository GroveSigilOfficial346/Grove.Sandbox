const API = "https://fpkrvgcpbnrusbfmhinj.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa3J2Z2NwYm5ydXNiZm1oaW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTc2OTYsImV4cCI6MjEwODA5MzY5Nn0.3CI1pHaEnpcQjnweA_g4Cmsscqp3eltMXWbPj2owHfo";

const landing = document.querySelector(".landing");
const memberLabel = document.querySelector("#member-count");
const vitalityLabel = document.querySelector("#vitality-status");

async function countRows(table, since) {
  const params = new URLSearchParams({ select: "id" });
  if (since) params.set("created_at", `gte.${since}`);

  const response = await fetch(
    `${API}/rest/v1/${table}?${params}`,
    {
      method: "HEAD",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: "count=exact"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Could not count ${table}`);
  }

  const range = response.headers.get("content-range");
  const count = Number(range?.split("/").pop());

  if (!Number.isFinite(count)) {
    throw new Error(`Invalid count for ${table}`);
  }

  return count;
}

function setGrowthStage(members) {
  landing.dataset.stage =
    members >= 200 ? "thriving" :
    members >= 50 ? "flourishing" :
    members >= 10 ? "growing" : "seed";
}

function setVitality(score) {
  const level =
    score >= 100 ? "thriving" :
    score >= 40 ? "alive" :
    score >= 10 ? "awakening" : "quiet";

  landing.dataset.vitality = level;

  const labels = {
    quiet: "Resting",
    awakening: "Awakening",
    alive: "Active",
    thriving: "Thriving"
  };

  vitalityLabel.textContent = labels[level];
}

async function loadCommunity() {
  try {
    const members = await countRows("profiles");
    memberLabel.textContent = members.toLocaleString();
    setGrowthStage(members);
  } catch (error) {
    memberLabel.textContent = "—";
    console.error("Grove member count:", error);
  }

  try {
    const since = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const tables = [
      ["posts", 3],
      ["comments", 2],
      ["post_likes", 1],
      ["follows", 2]
    ];

    const counts = await Promise.all(
      tables.map(async ([table, weight]) => ({
        weight,
        count: await countRows(table, since)
      }))
    );

    const score = counts.reduce(
      (total, item) => total + item.count * item.weight,
      0
    );

    setVitality(score);
  } catch (error) {
    vitalityLabel.textContent = "Unavailable";
    landing.dataset.vitality = "quiet";
    console.error("Grove vitality:", error);
  }
}

loadCommunity();
