// 🔁 REPLACE with your *published* Google Doc TXT/HTML export
const DOC_URL =
  "https://docs.google.com/document/d/e/2PACX-1vTttPljynR91dDiovjylkAwcfkUrVLQ1elPoktl_F0ti5i7czxGHP0AQOL-CYBG8WNbFrkLOhfKlrT7/pub?embedded=true";

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
const toMinutes = t => parseInt(t.slice(0,2)) * 60 + parseInt(t.slice(2));

function classify(label) {
  const l = label.toLowerCase();
  if (l.includes("run") || l.includes("gym")) return "run";
  if (l.includes("lunch") || l.includes("dinner")) return "food";
  if (l.includes("sleep")) return "sleep";
  return "work";
}

// ---------- fetch & render ----------
fetch(DOC_URL)
  .then(r => r.text())
  .then(raw => {
    const lines = raw.replace(/<[^>]+>/g, "").split("\n");
    let currentDay = null;
    let days = [];

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      if (/^\d{2}\/\d{2}\/\d{2}$/.test(line)) {
        currentDay = { date: line, events: [] };
        days.push(currentDay);
      } else if (currentDay) {
        const match = line.match(
          /^(\d{4})(?:-(\d{4}))?\s+(.*)$/
        );
        if (!match) return;

        const start = toMinutes(match[1]);
        const end = match[2] ? toMinutes(match[2]) : start + 10;
        currentDay.events.push({
          start, end, label: match[3]
        });
      }
    });

    days.forEach(day => renderDay(day));
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

  // wake/sleep window
  const wake = day.events.find(e => e.label.toLowerCase().includes("wake"));
  const sleep = day.events.find(e => e.label.toLowerCase().includes("sleep"));
  if (wake && sleep) {
    const awakeBlock = document.createElement("div");
    awakeBlock.className = "awake-block";
    awakeBlock.style.left = `${(wake.start / 1440) * 100}%`;
    awakeBlock.style.width =
      `${((sleep.start - wake.start) / 1440) * 100}%`;
    row.appendChild(awakeBlock);
  }

  // overlap handling
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

    const height = 70 / Math.min(e.laneCount, 3);
    div.style.height = `${height}px`;
    div.style.top = `${20 + e.lane * height}px`;

    row.appendChild(div);
  });

  timeline.appendChild(row);
}
