/* ───────── CONFIG ───────── */

const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const DAY_START = 5 * 60;     // 05:00
const DAY_SPAN  = 1440;
const DAY_HEIGHT = 100;
const PADDING = 4;

/* ───────── DOM ───────── */

const timeline = document.getElementById("timeline");
const hourHeader = document.getElementById("hour-header");

/* ───────── hour labels ───────── */

for (let i = 0; i < 24; i++) {
  const h = document.createElement("div");
  h.className = "hour";
  h.textContent = `${String((5 + i) % 24).padStart(2, "0")}:00`;
  hourHeader.appendChild(h);
}

/* ───────── helpers ───────── */

const toMinutes = t =>
  parseInt(t.slice(0,2)) * 60 + parseInt(t.slice(2));

const normalize = m => (m < DAY_START ? m + 1440 : m);

function classify(label) {
  const l = label.toLowerCase();
  if (l.includes("sleep")) return "sleep";
  if (l.includes("run") || l.includes("gym")) return "run";
  if (l.includes("lunch") || l.includes("dinner")) return "food";
  return "work";
}

/* ───────── generate 2026 ───────── */

const days = [];
const dayMap = {};

for (let d = new Date("2026-01-01"); d <= new Date("2026-12-31"); d.setDate(d.getDate() + 1)) {
  const iso = d.toISOString().slice(0,10);
  const label = d.toLocaleDateString("en-GB");
  const day = { iso, label, events: [] };
  days.push(day);
  dayMap[iso] = day;
}

/* ───────── load document ───────── */

fetch(DOC_URL)
  .then(r => r.text())
  .then(text => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let currentDay = null;

    lines.forEach(line => {
      const dm = line.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dm) {
        currentDay = dayMap[`${dm[3]}-${dm[2]}-${dm[1]}`] || null;
        return;
      }

      if (!currentDay) return;

      const em = line.match(/^(\d{4})(?:-(\d{4}))?\s+(.*)$/);
      if (!em) return;

      const start = normalize(toMinutes(em[1]));
      const end   = em[2] ? normalize(toMinutes(em[2])) : start + 10;

      currentDay.events.push({ start, end, label: em[3] });
    });

    days.forEach(renderDay);
  });

/* ───────── layout logic (YOUR RULE) ───────── */

function layoutEvents(events) {
  events.forEach(e => {
    e.maxOverlap = 0;
    events.forEach(o => {
      if (e !== o && e.start < o.end && e.end > o.start) {
        e.maxOverlap++;
      }
    });
  });

  events.forEach(e => {
    if (e.maxOverlap >= 2) e.frac = 1 / 3;
    else if (e.maxOverlap === 1) e.frac = 1 / 2;
    else e.frac = 1;
  });

  let cursor = PADDING;
  events.forEach(e => {
    e.topPx = cursor;
    e.baseHeight = DAY_HEIGHT * e.frac - PADDING;
    cursor += e.baseHeight + PADDING;
  });
}

/* ───────── render ───────── */

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
      `${((e.start - DAY_START) / DAY_SPAN) * 100}%`;
    div.style.width =
      `${((e.end - e.start) / DAY_SPAN) * 100}%`;

    const promoted =
      e.frac === 1/2 &&
      day.events.some(o =>
        o !== e &&
        o.frac === 1/3 &&
        e.start < o.end &&
        e.end > o.start
      );

    const height = DAY_HEIGHT * (promoted ? 2/3 : e.frac) - PADDING;

    div.style.height = `${height}px`;
    div.style.top = `${e.topPx}px`;

    row.appendChild(div);
  });

  timeline.appendChild(row);
}
