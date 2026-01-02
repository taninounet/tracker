/* ───── CONFIG ───── */

const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const DAY_START = 5 * 60;   // 05:00
const DAY_SPAN = 1440;      // 24h view window
const DAY_HEIGHT = 100;     // px (keep in sync with .day-row height in CSS)

/*
  vertical geometry (your rule):
  N = DAY_HEIGHT
  E = 3% of N (top and bottom padding)
  gap = 2*E (between stacked bands, and between neighbouring days' events)
*/
const E_FRAC = 0.03;
const GAP_FRAC = 0.06; // = 2 * E_FRAC

/*
  Triple-overlap layout you specified:
  3% pad + 27% + 6% + 28% + 6% + 27% + 3% = 100%
*/
const BAND_FRACS = [0.27, 0.28, 0.27];

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

const toMinutes = t => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(2));
const normalize = m => (m < DAY_START ? m + 1440 : m);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function overlaps(a, b) {
  return a.start < b.end && a.end > b.start;
}

function classify(label) {
  const l = label.toLowerCase();
  if (/^\d{4}\.$/.test(label.trim())) return "marker";
  if (l.includes("run") || l.includes("gym")) return "run";
  if (l.includes("lunch") || l.includes("dinner") || l.includes("breakfast")) return "food";
  return "work";
}

/* ───── generate 2026 days ───── */

const days = [];
const dayMap = {};

for (
  let d = new Date("2026-01-01");
  d <= new Date("2026-12-31");
  d.setDate(d.getDate() + 1)
) {
  const iso = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString("en-GB");
  const day = { iso, label, events: [], wake: null, sleep: null, sleepBlocks: [] };
  days.push(day);
  dayMap[iso] = day;
}

/* ───── load Google Doc ───── */

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

      // marker line: 0913.
      const mm = line.match(/^(\d{4})\.$/);
      if (mm) {
        const start = normalize(toMinutes(mm[1]));
        const end = start + 10; // tiny visible pill
        currentDay.events.push({ start, end, label: `${mm[1]}.`, _isMarker: true });
        return;
      }

      // normal event line: 0945-1030 Breakfast & planning  OR 2230 Reading
      const em = line.match(/^(\d{4})(?:-(\d{4}))?\s+(.*)$/);
      if (!em) return;

      const start = normalize(toMinutes(em[1]));
      const end = em[2] ? normalize(toMinutes(em[2])) : start + 10;

      currentDay.events.push({ start, end, label: em[3] });
    });

    // derive wake/sleep times from marker entries per day
    days.forEach(day => {
      const markers = day.events
        .filter(e => e._isMarker)
        .sort((a, b) => a.start - b.start);

      if (markers.length) {
        day.wake = markers[0].start;
        day.sleep = markers[markers.length - 1].start;
      }

      // compute sleep blocks for the view window [DAY_START, DAY_START + DAY_SPAN]
      const viewStart = DAY_START;
      const viewEnd = DAY_START + DAY_SPAN;

      // morning sleep: from viewStart to today's wake
      if (day.wake != null) {
        const wake = clamp(day.wake, viewStart, viewEnd);
        if (wake > viewStart) day.sleepBlocks.push({ start: viewStart, end: wake });
      }

      // evening sleep: from today's sleep to viewEnd
      if (day.sleep != null) {
        const sleep = clamp(day.sleep, viewStart, viewEnd);
        if (sleep < viewEnd) day.sleepBlocks.push({ start: sleep, end: viewEnd });
      }
    });

    days.forEach(renderDay);
  });

/* ───── layout engine ───── */

function computeFractions(events) {
  // ignore markers for overlap sizing rules (they're tiny)
  const real = events.filter(e => !e._isMarker);

  real.forEach(e => {
    e.maxOverlap = 0;
    real.forEach(o => {
      if (e !== o && overlaps(e, o)) e.maxOverlap++;
    });
  });

  real.forEach(e => {
    // if at any point it shares time with 2 other events => always third height
    if (e.maxOverlap >= 2) e.frac = 1 / 3;
    else if (e.maxOverlap === 1) e.frac = 1 / 2;
    else e.frac = 1;
  });

  // markers: never influence promotions
  events.forEach(e => {
    if (e._isMarker) e.frac = 1 / 2;
  });
}

function computeSpan(e, events) {
  if (e.frac === 1) return 3;
  if (e.frac === 1 / 3) return 1;

  // promotion rule:
  // a half-height event that overlaps any third-height event becomes the big 2-band block (61% vibe)
  const promoted =
    e.frac === 1 / 2 &&
    events.some(o => o !== e && o.frac === 1 / 3 && overlaps(e, o));

  return promoted ? 2 : 1;
}

function layoutEvents(events) {
  computeFractions(events);

  events.forEach(e => {
    e.span = computeSpan(e, events);
  });

  // stable placement: earlier start first, longer first
  events.sort((a, b) => (a.start - b.start) || (b.end - b.start) - (a.end - a.start));

  const active = [];

  function maskFor(ev) {
    if (ev.span === 3) return 0b111;
    if (ev.span === 2) return ev.band === 0 ? 0b011 : 0b110;
    return 1 << ev.band;
  }

  events.forEach(e => {
    // expire active
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= e.start) active.splice(i, 1);
    }

    let occupied = 0;
    active.forEach(a => { occupied |= maskFor(a); });

    if (e.span === 3) {
      e.band = 0;
    } else if (e.span === 2) {
      // prefer top 2 bands if possible, else bottom 2
      if ((occupied & 0b011) === 0) e.band = 0;
      else if ((occupied & 0b110) === 0) e.band = 1;
      else e.band = 0; // fallback
    } else {
      // span 1
      if ((occupied & 0b001) === 0) e.band = 0;
      else if ((occupied & 0b010) === 0) e.band = 1;
      else if ((occupied & 0b100) === 0) e.band = 2;
      else e.band = 0; // fallback
    }

    active.push(e);
  });
}

/* ───── render ───── */

function renderDay(day) {
  const row = document.createElement("div");
  row.className = "day-row";

  const label = document.createElement("div");
  label.className = "day-label";
  label.textContent = day.label;
  row.appendChild(label);

  // sleep blocks first (above grid, behind events)
  const viewStart = DAY_START;
  const viewEnd = DAY_START + DAY_SPAN;

  day.sleepBlocks.forEach(b => {
    const leftPct = ((b.start - viewStart) / DAY_SPAN) * 100;
    const widthPct = ((b.end - b.start) / DAY_SPAN) * 100;

    const div = document.createElement("div");
    div.className = "sleep-block";
    div.style.left = `${leftPct}%`;
    div.style.width = `${widthPct}%`;
    row.appendChild(div);
  });

  layoutEvents(day.events);

  const N = DAY_HEIGHT;
  const E = N * E_FRAC;         // 3% top/bottom
  const GAP = N * GAP_FRAC;     // 6% between stacked blocks

  const bandHeights = BAND_FRACS.map(f => f * N);
  const bandTops = [
    E,
    E + bandHeights[0] + GAP,
    E + bandHeights[0] + GAP + bandHeights[1] + GAP
  ];

  const fullTop = E;
  const fullHeight = N - 2 * E; // 94%

  day.events.forEach(e => {
    const div = document.createElement("div");
    div.className = `event ${classify(e.label)}`;
    div.textContent = e.label;

    // horizontal placement
    const left = ((e.start - viewStart) / DAY_SPAN) * 100;
    const width = ((e.end - e.start) / DAY_SPAN) * 100;
    div.style.left = `${left}%`;
    div.style.width = `${width}%`;

    // vertical placement (your exact rules)
    if (e.span === 3) {
      div.style.top = `${fullTop}px`;
      div.style.height = `${fullHeight}px`;
    } else if (e.span === 2) {
      const top = bandTops[e.band];
      const h =
        e.band === 0
          ? (bandHeights[0] + GAP + bandHeights[1])
          : (bandHeights[1] + GAP + bandHeights[2]);
      div.style.top = `${top}px`;
      div.style.height = `${h}px`;
    } else {
      div.style.top = `${bandTops[e.band]}px`;
      div.style.height = `${bandHeights[e.band]}px`;
    }

    row.appendChild(div);
  });

  timeline.appendChild(row);
}
