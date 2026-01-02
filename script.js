const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const timeline = document.getElementById("timeline");
const hourHeader = document.getElementById("hour-header");

const DAY_START = 5 * 60;           // 05:00
const DAY_END = DAY_START + 1440;   // 04:00 next day
const DAY_HEIGHT = 100;
const PADDING = 4;

// ---------- hour header ----------
for (let i = 0; i < 24; i++) {
  const h = document.createElement("div");
  h.className = "hour";
  h.textContent = `${String((5 + i) % 24).padStart(2, "0")}:00`;
  hourHeader.appendChild(h);
}

// ---------- helpers ----------
const toMinutes = t =>
  parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(2));

const normalize = m => (m < DAY_START ? m + 1440 : m);

function classify(label) {
  const l = label.toLowerCase();
  if (l.includes("run") || l.includes("gym")) return "run";
  if (l.includes("lunch") || l.includes("dinner")) return "food";
  if (l.includes("sleep")) return "sleep";
  return "work";
}

// ---------- generate 2026 days ----------
const days = [];
const start = new Date("2026-01-01");
const end = new Date("2026-12-31");

for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const key = d.toISOString().slice(0,10);
  days.push({
    key,
    label: d.toLocaleDateString("en-GB"),
    events: []
  });
}

const dayMap = Object.fromEntries(days.map(d => [d.label, d]));

// ---------- load document ----------
fetch(DOC_URL)
  .then(r => r.text())
  .then(text => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let currentDay = null;

    lines.forEach(line => {
      if (dayMap[line]) {
        currentDay = dayMap[line];
        return;
      }
      if (!currentDay) return;

      const m = line.match(/^(\d{4})(?:-(\d{4}))?\s+(.*)$/);
      if (!m) return;

      const start = normalize(toMinutes(m[1]));
      const end = m[2] ? normalize(toMinutes(m[2])) : start + 10;

      currentDay.events.push({
        start, end, label: m[3]
      });
    });

    days.forEach(renderDay);
  });

// ---------- overlap-aware layout ----------
function layoutEvents(events) {
  events.sort((a, b) => a.start - b.start);
  const clusters = [];

  events.forEach(e => {
    let placed = false;
    for (const c of clusters) {
      if (c.some(ev => e.start < ev.end && e.end > ev.start)) {
        c.push(e);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([e]);
  });

  clusters.forEach(cluster => {
    cluster.sort((a, b) => a.start - b.start);
    cluster.forEach((e, i) => {
      e.slot = i;
      e.slotCount = cluster.length;
    });
  });
}

// ---------- render ----------
function renderDay(day) {
  const row = document.createElement("div");
  row.className = "day-row";

  const label = document.createElement("div");
  label.className = "day-label";
  label.textContent = day.label;
  row.appendChild(label);

  layoutEvents(day.events);

  day.events.forEach(e => {
    const div = document.createElement("div");
    div.className = `event ${classify(e.label)}`;
    div.textContent = e.label;

    div.style.left =
      `${((e.start - DAY_START) / 1440) * 100}%`;
    div.style.width =
      `${((e.end - e.start) / 1440) * 100}%`;

    const slots = Math.min(e.slotCount, 3);
    const height =
      (DAY_HEIGHT - PADDING * (slots + 1)) / slots;

    div.style.height = `${height}px`;
    div.style.top =
      `${PADDING + e.slot * (height + PADDING)}px`;

    row.appendChild(div);
  });

  timeline.appendChild(row);
}
