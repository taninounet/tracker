const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const timeline = document.getElementById("timeline");
const hourHeader = document.getElementById("hour-header");

// timeline bounds
const DAY_START = 5 * 60;          // 05:00
const DAY_END = DAY_START + 1440;  // 04:00 next day

// ---------- hour labels ----------
for (let i = 0; i < 24; i++) {
  const hour = (5 + i) % 24;
  const d = document.createElement("div");
  d.className = "hour-label";
  d.textContent = `${String(hour).padStart(2, "0")}:00`;
  hourHeader.appendChild(d);
}

// ---------- helpers ----------
function toMinutes(t) {
  return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2), 10);
}

function normalize(min) {
  return min < DAY_START ? min + 1440 : min;
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
  .then(res => res.text())
  .then(text => {
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

      let start = normalize(toMinutes(m[1]));
      let end = m[2]
        ? normalize(toMinutes(m[2]))
        : start + 10;

      currentDay.events.push({
        start,
        end,
        label: m[3]
      });
    });

    days.forEach(renderDay);
  });

// ---------- render ----------
function renderDay(day) {
  const row = document.createElement("div");
  row.className = "day-row";

  const label = document.createElement("div");
  label.className = "day-label";
  label.textContent = day.date;
  row.appendChild(label);

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

    div.style.left =
      `${((e.start - DAY_START) / 1440) * 100}%`;
    div.style.width =
      `${((e.end - e.start) / 1440) * 100}%`;

    const lanesUsed = Math.min(e.laneCount, 3);
    const height = 66 / lanesUsed;

    div.style.height = `${height}px`;
    div.style.top = `${24 + e.lane * height}px`;

    row.appendChild(div);
  });

  timeline.appendChild(row);
}
