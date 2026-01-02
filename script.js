/* ───── CONFIG ───── */

const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const DAY_START = 5 * 60;   // 05:00
const DAY_SPAN = 1440;      // 24h window from 05:00 → 05:00
const DAY_HEIGHT = 100;     // N

// E = 3% of N, and 2E is the universal gap
const PAD_PCT = 0.03;
const PAD = Math.round(DAY_HEIGHT * PAD_PCT);   // E
const GAP = 2 * PAD;                             // 2E

// Heights implied by your formulas
const THIRD_H = (DAY_HEIGHT - 2 * PAD - 2 * GAP) / 3;  // ~27%
const HALF_H  = (DAY_HEIGHT - 2 * PAD - GAP) / 2;      // ~44%
const FULL_H  = (DAY_HEIGHT - 2 * PAD);                // ~94%
const BIG_H   = (DAY_HEIGHT - 2 * PAD - GAP - THIRD_H); // ~61%

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

const toMinutes = t => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2), 10);

// timeline is 05:00 → next day 05:00, so times before 05:00 belong to "next day" (+1440)
const normalize = m => (m < DAY_START ? m + 1440 : m);

function overlaps(a, b) {
  return a.start < b.end && a.end > b.start;
}

function classify(label) {
  const l = (label || "").toLowerCase();
  if (!label) return "work";
  if (l.includes("run") || l.includes("gym") || l.includes("workout")) return "run";
  if (l.includes("lunch") || l.includes("dinner") || l.includes("breakfast")) return "food";
  if (l.endsWith(".")) return "marker";
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
  const day = { iso, label, events: [], _dots: [], wake: null, sleep: null, sleepBlock: null };
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
      // date line: 01/01/2026
      const dm = line.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dm) {
        currentDay = dayMap[`${dm[3]}-${dm[2]}-${dm[1]}`] || null;
        return;
      }
      if (!currentDay) return;

      // dot-only marker: 0913.
      const dotm = line.match(/^(\d{4})\.$/);
      if (dotm) {
        currentDay._dots.push(`${dotm[1]}.`);
        return;
      }

      // event line:
      // 0945-1030 Breakfast & planning
      // 2230 Reading
      const em = line.match(/^(\d{4})(?:-(\d{4}))?(?:\s+(.*))?$/);
      if (!em) return;

      const start = normalize(toMinutes(em[1]));
      const end = em[2] ? normalize(toMinutes(em[2])) : (start + 10);
      const label = (em[3] || "").trim();

      currentDay.events.push({ start, end, label, kind: "event" });
    });

    // post-process wake/sleep markers + sleep blocks
    for (let i = 0; i < days.length; i++) {
      const day = days[i];

      if (day._dots.length) {
        // wake = first dot, sleep = last dot
        const wakeLabel = day._dots[0];
        const sleepLabel = day._dots[day._dots.length - 1];

        day.wake = toMinutes(wakeLabel.slice(0, 4));
        day.sleep = toMinutes(sleepLabel.slice(0, 4));

        // show both markers as tiny events (as-written: "0913.")
        day.events.push({
          start: normalize(day.wake),
          end: normalize(day.wake) + 10,
          label: wakeLabel,
          kind: "marker"
        });

        // sleep-time marker
        day.events.push({
          start: normalize(day.sleep),
          end: normalize(day.sleep) + 10,
          label: sleepLabel,
          kind: "marker"
        });
      }

      // sleep block: from previous day's sleep → today's wake (full height N, no vertical padding)
      const prev = i > 0 ? days[i - 1] : null;
      if (prev && prev.sleep != null && day.wake != null) {
        let s = normalize(prev.sleep);
        let e = normalize(day.wake);
        if (e <= s) e += 1440;

        day.sleepBlock = { start: s, end: e, kind: "sleepBlock" };
      }
    }

    days.forEach(renderDay);
  });

/* ───── sizing + lanes ───── */

function computeFixedSizes(events) {
  // ignore sleep block (it renders behind everything)
  const evs = events.filter(e => e.kind !== "sleepBlock");

  // overlap counting
  evs.forEach(e => {
    let count = 0;
    evs.forEach(o => {
      if (e !== o && overlaps(e, o)) count++;
    });
    e.maxOverlap = count;
    e.thirdFixed = (count >= 2); // ever overlaps with 2 others → always third
  });

  // promotion: overlaps any thirdFixed → always big (2/3-ish)
  evs.forEach(e => {
    e.bigFixed = !e.thirdFixed && evs.some(o => o.thirdFixed && overlaps(e, o));
  });

  // final size class
  evs.forEach(e => {
    if (e.thirdFixed) e.size = "third";
    else if (e.bigFixed) e.size = "big";
    else if (e.maxOverlap === 1) e.size = "half";
    else e.size = "full";
  });

  return evs;
}

function assignLanes(evs) {
  // lane end-times
  const laneEnd = [ -Infinity, -Infinity, -Infinity ];

  // sort by start (stable-ish)
  evs.sort((a, b) => (a.start - b.start) || (a.end - b.end));

  evs.forEach(e => {
    // free lanes
    for (let i = 0; i < 3; i++) {
      if (laneEnd[i] <= e.start) laneEnd[i] = -Infinity;
    }

    const laneCount =
      e.size === "third" ? 3 :
      (e.size === "half" || e.size === "big") ? 2 :
      1;

    // choose first available lane among allowed set
    let chosen = 0;
    const maxLane = laneCount - 1;

    // prefer keeping "third" events low, but otherwise just fill
    for (let i = 0; i <= maxLane; i++) {
      if (laneEnd[i] === -Infinity) { chosen = i; break; }
    }

    e.lane = chosen;
    laneEnd[chosen] = e.end;
  });
}

/* ───── render ───── */

function renderDay(day) {
  const row = document.createElement("div");
  row.className = "day-row";
  row.style.height = `${DAY_HEIGHT}px`;

  const label = document.createElement("div");
  label.className = "day-label";
  label.textContent = day.label;
  row.appendChild(label);

  // sleep block behind everything
  if (day.sleepBlock) {
    const s = document.createElement("div");
    s.className = "sleep-block";

    s.style.left = `${((day.sleepBlock.start - DAY_START) / DAY_SPAN) * 100}%`;
    s.style.width = `${((day.sleepBlock.end - day.sleepBlock.start) / DAY_SPAN) * 100}%`;

    s.style.top = `0px`;
    s.style.height = `${DAY_HEIGHT}px`;

    row.appendChild(s);
  }

  const evs = computeFixedSizes(day.events);
  assignLanes(evs);

  evs.forEach(e => {
    const div = document.createElement("div");

    const cls = classify(e.label);
    div.className = `event ${cls}`;

    // marker text exactly as written (e.g., "0913.")
    div.textContent = e.label || "";

    // horizontal placement
    div.style.left = `${((e.start - DAY_START) / DAY_SPAN) * 100}%`;
    div.style.width = `${((e.end - e.start) / DAY_SPAN) * 100}%`;

    // vertical placement using your exact padding model
    if (e.size === "full") {
      div.style.top = `${PAD}px`;
      div.style.height = `${FULL_H}px`;
    } else if (e.size === "half") {
      const slot = e.lane % 2; // 0 top, 1 bottom
      div.style.top = `${PAD + slot * (HALF_H + GAP)}px`;
      div.style.height = `${HALF_H}px`;
    } else if (e.size === "third") {
      const slot = Math.min(2, e.lane); // 0,1,2
      div.style.top = `${PAD + slot * (THIRD_H + GAP)}px`;
      div.style.height = `${THIRD_H}px`;
    } else if (e.size === "big") {
      // big + third pairing: either (small top, big bottom) OR (big top, small bottom)
      // lane 0 => big top; lane 1 => big bottom
      if ((e.lane % 2) === 0) {
        div.style.top = `${PAD}px`;
      } else {
        div.style.top = `${PAD + THIRD_H + GAP}px`;
      }
      div.style.height = `${BIG_H}px`;
    }

    row.appendChild(div);
  });

  timeline.appendChild(row);
}
