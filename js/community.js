const SUPABASE_URL =
  "https://fpkrvgcpbnrusbfmhinj.supabase.co";

const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa3J2Z2NwYm5ydXNiZm1oaW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTc2OTYsImV4cCI6MjEwODA5MzY5Nn0.3CI1pHaEnpcQjnweA_g4Cmsscqp3eltMXWbPj2owHfo";

const landing = document.querySelector(".landing");
const countLabel = document.querySelector("#member-count");

function setGrowthStage(members) {
  const stage =
    members >= 200 ? "thriving" :
    members >= 50 ? "flourishing" :
    members >= 10 ? "growing" : "seed";

  landing.dataset.stage = stage;
}

async function loadCommunity() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id`,
      {
        method: "HEAD",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "count=exact"
        }
      }
    );

    if (!response.ok) throw new Error("Community count unavailable");

    const range = response.headers.get("content-range");
    const members = Number(range?.split("/").pop());

    if (!Number.isFinite(members)) {
      throw new Error("Invalid community count");
    }

    countLabel.textContent = members.toLocaleString();
    setGrowthStage(members);
  } catch (error) {
    countLabel.textContent = "—";
    landing.dataset.stage = "seed";
    console.error("Grove community count:", error);
  }
}

loadCommunity();
