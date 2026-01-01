// ✅ Google Docs TXT export (NO CORS issues)
const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const timeline = document.getElementById("timeline");
const hourHeader = document.getElementById("hour-header");

// ---------- hour labels ----------
for (let h = 0; h < 24; h++) {
  const d = document.createElement("div");
  d.className = "hour-label";
  d.textContent = `${String(h).padStart(2, "0")}:00`;
  hourHeader.appendChild(d);
}

// ---------- helpers ----------
function toMinutes(t) {
  return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2), 10);
}

function classify(label) {
  const l = label.toLowerCase();
  if (l.includes("run") || l.includes("gym")) return "run";
  if (l.includes("lunch") || l.includes("dinner")) return "food";
  if (l.includes("sleep")) return "sleep";
  return "work";
}

// ---------- fetch & parse ----------
fetch(DOC_URL)
  .then(res => {
    if (!res.ok) throw new Error("Failed to fetch document");
    return res.text();
  })
  .then(text => {
    console.log("RAW DOC TEXT:", text); // 👈 debug, remove later

    const lines = text
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    let currentDay = null;
    const days = [];

    lines.forEach(line => {
      if (/^\d{2}\/\d{2}\/\d{2}$/.test(line)) {
        currentDay = { date: line, events: [] };
        days.push(currentDay);
        return;
      }

      if (!currentDay) return;

      const m = line.match(/^(\d{4})(?:-(\d{4}))?\s+(.*)$/);
      if (!m) return;

      const start = toMinutes(m[1]);
      const end = m[2] ? toMinutes(m[2]) : start + 10;

      currentDay.events.push({
        start,
        end,
        label: m[3]
      });
    });

    days.forEach(renderDay);
  })
  .catch(err => {
    console.error("TIMELINE ERROR:", err);
  });

// ---------- render ----------
function renderDay(day) {
  const row = document.createElement("div");
  row.className = "day-row";

  const label = document.createElement("div");
  label.className = "day-label";
  label.textContent = day.date;
  row.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "hour-grid";
  for (let i = 0; i < 24; i++) grid.appendChild(document.createElement("div"));
  row.appendChild(grid);

  // wake → sleep window
  const wake = day.events.find(e => e.label.toLowerCase().includes("wake"));
  const sleep = day.events.find(e => e.label.toLowerCase().includes("sleep"));

  if (wake && sleep && sleep.start > wake.start) {
    const awakeBlock = document.createElement("div");
    awakeBlock.className = "awake-block";
    awakeBlock.style.left = `${(wake.start / 1440) * 100}%`;
    awakeBlock.style.width =
      `${((sleep.start - wake.start) / 1440) * 100}%`;
    row.appendChild(awakeBlock);
  }

  // concurrency lanes
  const lanes = [];

  day.events.forEach(e => {
    let lane = lanes.find(l =>
      l.every(ev => e.end <= ev.start || e.start >= ev.end)
    );
    if (!lane) {
      lane = [];
      lanes.push(lane);
    }
    lane.push(e);
    e.lane = lanes.indexOf(lane);
    e.laneCount = lanes.length;
  });

  day.events.forEach(e => {
    const div = document.createElement("div");
    div.className = `event ${classify(e.label)}`;
    div.textContent = e.label;

    div.style.left = `${(e.start / 1440) * 100}%`;
    div.style.width = `${((e.end - e.start) / 1440) * 100}%`;

    const lanesUsed = Math.min(e.laneCount, 3);
    const height = 64 / lanesUsed;

    div.style.height = `${height}px`;
    div.style.top = `${22 + e.lane * height}px`;

    row.appendChild(div);
  });

  timeline.appendChild(row);
}
