/* ───── CONFIG ───── */

const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const DAY_START = 5 * 60;   // 05:00
const DAY_SPAN = 1440;      // 24h window from DAY_START to next DAY_START
const DAY_HEIGHT = 100;     // px height of each day row

// padding and gaps as % of DAY_HEIGHT
const PAD_FRAC = 0.03;      // 3% top + 3% bottom
const GAP_FRAC = 0.06;      // 6% between stacked events (and therefore also 2*PAD)

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

/* ───── event categories (hashtag → color + icon) ───── */

const CATEGORY_MAP = {
  eth: {
    tags: ["#eth"],
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9L26_ZukimLnw3D7fXNf3fSRSOzDImatJMQ&s"
  },
  run: {
    tags: ["#run"],
    logo: "https://imgnike-a.akamaihd.net/branding/cdp-pegasus-41/assets/img/logo_big.jpg"
  },
  leet: {
    tags: ["#leet"],
    logo: "https://upload.wikimedia.org/wikipedia/commons/1/19/LeetCode_logo_black.png"
  },
  quant: {
    tags: ["#quant"],
    logo: "https://dbpxikdadyyelyemwaef.supabase.co/storage/v1/object/public/logos//optiverLogo.svg"
  },
  duo: {
    tags: ["#duo"],
    logo: "https://companieslogo.com/img/orig/DUOL-5baebe62.png?t=1720244491"
  },
  aldi: {
    tags: ["#aldi"],
    /* UPDATED */
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Aldi_Süd_2017_logo.svg/1696px-Aldi_Süd_2017_logo.svg.png"
  },
  easy: {
    tags: ["#easy"],
    logo: "https://companieslogo.com/img/orig/EZJ.L-794b8320.png?t=1720244491"
  }
};

// quick lookup: "#eth" -> "eth"
const TAG_TO_CATEGORY = {};
Object.entries(CATEGORY_MAP).forEach(([key, def]) => {
  def.tags.forEach(t => (TAG_TO_CATEGORY[t] = key));
});

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// returns { cat: "eth" | null, text: "clean label", tag: "#eth" | null }
function parseCategory(label) {
  const tags = label.match(/#[A-Za-z0-9_]+/g) || [];
  for (const raw of tags) {
    const t = raw.toLowerCase();
    const cat = TAG_TO_CATEGORY[t];
    if (!cat) continue;

    // remove the first matching tag token from display text (case-insensitive)
    const reTag = new RegExp(`(^|\\s)${escapeRegExp(raw)}(?=\\s|$)`, "i");
    const clean = label
      .replace(reTag, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    return { cat, text: clean, tag: t };
  }
  return { cat: null, text: label.trim(), tag: null };
}

function overlaps(a, b) {
  return a.start < b.end && a.end > b.start;
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
  const day = { iso, label, events: [], dotTimes: [], wake: null, sleep: null };
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
      // date header
      const dm = line.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dm) {
        currentDay = dayMap[`${dm[3]}-${dm[2]}-${dm[1]}`] || null;
        return;
      }
      if (!currentDay) return;

      // wake/sleep marker like "0913."
      const tm = line.match(/^(\d{4})\.$/);
      if (tm) {
        currentDay.dotTimes.push(normalize(toMinutes(tm[1])));
        return;
      }

      // normal event
      const em = line.match(/^(\d{4})(?:-(\d{4}))?\s+(.*)$/);
      if (!em) return;

      const start = normalize(toMinutes(em[1]));
      const end = em[2] ? normalize(toMinutes(em[2])) : start + 10;

      currentDay.events.push({ start, end, label: em[3] });
    });

    // decide wake (first dotted time) + sleep (last dotted time) per day
    days.forEach(d => {
      if (d.dotTimes.length) {
        d.wake = d.dotTimes[0];
        d.sleep = d.dotTimes[d.dotTimes.length - 1];
      }
    });

    days.forEach(renderDay);
  });

/* ───── layout engine ─────
   Rules:
   - if an event overlaps *two other* events at the same time at ANY point → fixed "third" height forever
   - otherwise if it overlaps exactly one other at ANY point → fixed "half" height forever
   - BUT if a "half" event overlaps any "third" event at any point → it becomes the big 61% height forever
*/

function layoutEvents(events) {
  // compute per-event maximum simultaneous overlap inside its own interval
  events.forEach(e => {
    const boundaries = [];
    events.forEach(o => {
      if (e === o) return;
      if (!overlaps(e, o)) return;

      // overlap segment within e
      boundaries.push({ t: Math.max(e.start, o.start), type: "start" });
      boundaries.push({ t: Math.min(e.end, o.end), type: "end" });
    });

    boundaries.sort((a, b) => (a.t - b.t) || (a.type === "end" ? -1 : 1));

    let active = 0;
    let maxSimul = 0;
    for (const p of boundaries) {
      if (p.type === "start") {
        active++;
        maxSimul = Math.max(maxSimul, active);
      } else {
        active = Math.max(0, active - 1);
      }
    }
    // maxSimul is how many OTHER events overlap simultaneously; total in that interval is maxSimul + 1 (itself)
    e.maxSimul = maxSimul + 1;
  });

  // base kind
  events.forEach(e => {
    if (e.maxSimul >= 3) e.kind = "third";       // triple-share exists somewhere
    else if (e.maxSimul === 2) e.kind = "half";  // at most double-share
    else e.kind = "full";
  });

  // promotion: any "half" overlapping a "third" becomes "big"
  const thirds = events.filter(e => e.kind === "third");
  events.forEach(e => {
    if (e.kind !== "half") return;
    if (thirds.some(t => overlaps(e, t))) {
      e.kind = "big";
    }
  });

  // lane assignment (0..2) with greedy coloring
  events.sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnd = [-Infinity, -Infinity, -Infinity];

  events.forEach(e => {
    let lane = 0;
    while (lane < 3 && laneEnd[lane] > e.start) lane++;
    if (lane >= 3) lane = 2;
    e.lane = lane;
    laneEnd[lane] = e.end;
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

  // sleep background blocks
  addSleepBlocks(row, day);

  // normal events
  layoutEvents(day.events);

  const PAD = DAY_HEIGHT * PAD_FRAC;
  const GAP = DAY_HEIGHT * GAP_FRAC;

  function verticalBox(e) {
    if (e.kind === "full") {
      return { top: PAD, height: DAY_HEIGHT - 2 * PAD };
    }

    if (e.kind === "half") {
      const h = DAY_HEIGHT * 0.44;
      const top = e.lane === 0 ? PAD : (PAD + h + GAP);
      return { top, height: h };
    }

    if (e.kind === "third") {
      const h0 = DAY_HEIGHT * 0.27;
      const h1 = DAY_HEIGHT * 0.28;
      const top0 = PAD;
      const top1 = top0 + h0 + GAP;
      const top2 = top1 + h1 + GAP;

      if (e.lane === 1) return { top: top1, height: h1 };
      if (e.lane === 2) return { top: top2, height: h0 };
      return { top: top0, height: h0 };
    }

    if (e.kind === "big") {
      const bigH = DAY_HEIGHT * 0.61;
      const smallH = DAY_HEIGHT * 0.27;

      const t = day.events.find(o => o !== e && o.kind === "third" && overlaps(e, o));

      let bigOnTop = false;
      if (t) bigOnTop = e.lane < t.lane;
      else bigOnTop = (e.lane === 0);

      const topBig = bigOnTop ? PAD : (PAD + smallH + GAP);
      return { top: topBig, height: bigH };
    }

    return { top: PAD, height: DAY_HEIGHT - 2 * PAD };
  }

  day.events.forEach(e => {
    const div = document.createElement("div");
    const info = parseCategory(e.label);

    div.className = "event";
    if (info.cat) div.dataset.cat = info.cat;

    if (info.cat) {
      const img = document.createElement("img");
      img.className = "event-icon";
      img.alt = info.cat;
      img.src = CATEGORY_MAP[info.cat].logo;
      img.loading = "lazy";
      div.appendChild(img);
    }

    const span = document.createElement("span");
    span.className = "event-text";
    span.textContent = info.text;
    div.appendChild(span);

    const leftPct = ((e.start - DAY_START) / DAY_SPAN) * 100;
    const widthPct = ((e.end - e.start) / DAY_SPAN) * 100;
    div.style.left = `${leftPct}%`;
    div.style.width = `${widthPct}%`;

    const { top, height } = verticalBox(e);
    div.style.top = `${top}px`;
    div.style.height = `${height}px`;

    row.appendChild(div);
  });

  timeline.appendChild(row);
}

function addSleepBlocks(row, day) {
  const spanEnd = DAY_START + DAY_SPAN;

  function addBlock(start, end) {
    const s = Math.max(start, DAY_START);
    const e = Math.min(end, spanEnd);
    if (e <= s) return;

    const div = document.createElement("div");
    div.className = "sleep-bg";
    div.style.left = `${((s - DAY_START) / DAY_SPAN) * 100}%`;
    div.style.width = `${((e - s) / DAY_SPAN) * 100}%`;
    row.appendChild(div);
  }

  if (typeof day.wake === "number" && day.wake > DAY_START) {
    addBlock(DAY_START, day.wake);
  }

  if (typeof day.sleep === "number" && day.sleep < spanEnd) {
    addBlock(day.sleep, spanEnd);
  }
}
