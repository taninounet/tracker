/* ───── CONFIG ───── */

const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const DAY_START = 5 * 60;
const DAY_SPAN = 1440;
const DAY_HEIGHT = 100;

const PAD_FRAC = 0.03;
const GAP_FRAC = 0.06;

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
const overlaps = (a, b) => a.start < b.end && a.end > b.start;

/* ───── TAG SYSTEM ───── */

const TAGS = {
  eth: {
    class: "eth",
    icon: "https://upload.wikimedia.org/wikipedia/commons/e/ea/ETH_Zürich_Logo.svg"
  },
  run: {
    class: "run",
    icon: "https://cdn.eventtia.com/model_image_attachments/1591267/small/RUNSWOOSHVOLTORANGEportraitv217187513401718751340.png"
  },
  leet: {
    class: "leet",
    icon: "https://upload.wikimedia.org/wikipedia/commons/1/19/LeetCode_logo_black.png"
  },
  quant: {
    class: "quant",
    icon: "https://dbpxikdadyyelyemwaef.supabase.co/storage/v1/object/public/logos//optiverLogo.svg"
  },
  duo: {
    class: "duo",
    icon: "https://pngdownload.io/wp-content/uploads/2023/12/Duolingo-logo-language-learning-app-owl-logo-transparent-png-jpg.webp"
  },
  sbb: {
    class: "sbb",
    icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/SBB_logo_simplified.svg/1200px-SBB_logo_simplified.svg.png"
  }
};

function extractTag(label) {
  const m = label.match(/#([a-z]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function cleanLabel(label) {
  return label.replace(/#\w+/gi, "").trim();
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
  const day = { iso, label, events: [], dotTimes: [], wake: null, sleep: null };
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

      const tm = line.match(/^(\d{4})\.$/);
      if (tm) {
        currentDay.dotTimes.push(normalize(toMinutes(tm[1])));
        return;
      }

      const em = line.match(/^(\d{4})(?:-(\d{4}))?\s+(.*)$/);
      if (!em) return;

      const start = normalize(toMinutes(em[1]));
      const end = em[2] ? normalize(toMinutes(em[2])) : start + 10;
      currentDay.events.push({ start, end, label: em[3] });
    });

    days.forEach(d => {
      if (d.dotTimes.length) {
        d.wake = d.dotTimes[0];
        d.sleep = d.dotTimes[d.dotTimes.length - 1];
      }
    });

    days.forEach(renderDay);
  });

/* ───── layout + render ───── */

function renderDay(day) {
  const row = document.createElement("div");
  row.className = "day-row";
  row.style.height = `${DAY_HEIGHT}px`;

  const label = document.createElement("div");
  label.className = "day-label";
  label.textContent = day.label;
  row.appendChild(label);

  addSleepBlocks(row, day);

  const PAD = DAY_HEIGHT * PAD_FRAC;
  const GAP = DAY_HEIGHT * GAP_FRAC;

  day.events.forEach(e => {
    const div = document.createElement("div");

    const tag = extractTag(e.label);
    const meta = tag && TAGS[tag];
    const text = cleanLabel(e.label);

    div.className = `event ${meta ? meta.class : "default"}`;

    if (meta?.icon) {
      const img = document.createElement("img");
      img.className = "icon";
      img.src = meta.icon;
      div.appendChild(img);
    }

    const span = document.createElement("span");
    span.textContent = text;
    div.appendChild(span);

    const leftPct = ((e.start - DAY_START) / DAY_SPAN) * 100;
    const widthPct = ((e.end - e.start) / DAY_SPAN) * 100;

    div.style.left = `${leftPct}%`;
    div.style.width = `${widthPct}%`;
    div.style.top = `${PAD}px`;
    div.style.height = `${DAY_HEIGHT - 2 * PAD}px`;

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

  if (day.wake > DAY_START) addBlock(DAY_START, day.wake);
  if (day.sleep < spanEnd) addBlock(day.sleep, spanEnd);
}
