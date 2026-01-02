/* ───── CONFIG ───── */

const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const DAY_START = 5 * 60;   // 05:00
const DAY_SPAN = 1440;
const DAY_HEIGHT = 100;

const TOTAL_BANDS = 3;
const GAP = 6;

/* ───── DOM ───── */

const timeline = document.getElementById("timeline");
const hourHeader = document.getElementById("hour-header");

/* ───── hour labels ───── */

for (let i = 0; i < 24; i++) {
  const h = document.createElement("div");
  h.className = "hour";
  h.textContent = `${String((5 + i) % 24).padStart(2, "0")}:00`;
  hourHeader.appendChild(h);
}

/* ───── helpers ───── */

const toMinutes = t =>
  parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(2));

const normalize = m => (m < DAY_START ? m + 1440 : m);

function classify(label) {
  const l = label.toLowerCase();
  if (l.includes("run") || l.includes("gym")) return "run";
  if (l.includes("lunch") || l.includes("dinner") || l.includes("breakfast")) return "food";
  return "work";
}

/* ───── generate days ───── */

const days = [];
const dayMap = {};

for (
  let d = new Date("2026-01-01");
  d <= new Date("2026-12-31");
  d.setDate(d.getDate() + 1)
) {
  const iso = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString("en-GB");
  const day = { iso, label, events: [], wake: null, sleep: null };
  days.push(day);
  dayMap[iso] = day;
}

/* ───── load doc ───── */

fetch(DOC_URL)
  .then(r => r.text())
  .then(text => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let currentDay = null;

    lines.forEach(line => {
      const dm = line.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dm) {
        currentDay = dayMap[`${dm[3]}-${dm[2]}-${dm[1]}`];
        return;
      }

      if (!currentDay) return;

      // wake / sleep: XXXX.
      const tm = line.match(/^(\d{4})\.$/);
      if (tm) {
        const t = normalize(toMinutes(tm[1]));
        if (currentDay.wake === null) currentDay.wake = t;
        else currentDay.sleep = t;
        return;
      }

      const em = line.match(/^(\d{4})-(\d{4})\s+(.*)$/);
      if (!em) return;

      currentDay.events.push({
        start: normalize(toMinutes(em[1])),
        end: normalize(toMinutes(em[2])),
        label: em[3]
      });
    });

    days.forEach((d, i) => renderDay(d, days[i - 1]));
  });

/* ───── layout engine ───── */

function layoutEvents(events) {
  events.forEach(e => {
    e.overlap = events.filter(o =>
      o !== e && e.start < o.end && e.end > o.start
    ).length;
    e.frac = e.overlap >= 2 ? 1/3 : e.overlap === 1 ? 1/2 : 1;
  });

  events.sort((a, b) => a.start - b.start);
  const active = [];

  events.forEach(e => {
    active.filter(a => a.end > e.start);
    let band = 0;
    while (active.some(a => a.band === band)) band++;
    e.band = band;
    active.push(e);
  });
}

/* ───── render ───── */

function renderDay(day, prevDay) {
  const row = document.createElement("div");
  row.className = "day-row";

  const label = document.createElement("div");
  label.className = "day-label";
  label.textContent = day.label;
  row.appendChild(label);

  /* sleep background */
  if (prevDay && prevDay.sleep !== null && day.wake !== null) {
    const bg = document.createElement("div");
    bg.className = "sleep-bg";
    bg.style.left = `${((prevDay.sleep - DAY_START) / DAY_SPAN) * 100}%`;
    bg.style.width = `${((day.wake - prevDay.sleep) / DAY_SPAN) * 100}%`;
    row.appendChild(bg);
  }

  layoutEvents(day.events);

  const usable = DAY_HEIGHT - GAP * (TOTAL_BANDS - 1);
  const bandH = usable / TOTAL_BANDS;

  day.events.forEach(e => {
    const el = document.createElement("div");
    el.className = `event ${classify(e.label)}`;
    el.textContent = e.label;

    el.style.left = `${((e.start - DAY_START) / DAY_SPAN) * 100}%`;
    el.style.width = `${((e.end - e.start) / DAY_SPAN) * 100}%`;

    const bands = e.frac === 1 ? 3 : e.frac === 1/2 ? 2 : 1;
    el.style.height = `${bands * bandH + (bands - 1) * GAP}px`;
    el.style.top = `${e.band * (bandH + GAP)}px`;

    row.appendChild(el);
  });

  timeline.appendChild(row);
}
