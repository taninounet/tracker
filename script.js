/* ───── CONFIG ───── */

const DOC_URL =
  "https://docs.google.com/document/d/1WTC4OuGIHjd7BJMvV9gNSNjptupzSFCtRmtXEeY1Fbg/export?format=txt";

const DAY_START = 5 * 60;   // 05:00
const DAY_SPAN = 1440;      // 24h window
const DAY_HEIGHT = 100;     // px height per day

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

const toMinutes = t => parseInt(t.slice(0,2))*60 + parseInt(t.slice(2));
const normalize = m => (m < DAY_START ? m + 1440 : m);

function classify(label) {
  const l = label.toLowerCase();
  if (l.includes("run") || l.includes("gym")) return "run";
  if (l.includes("lunch") || l.includes("dinner") || l.includes("breakfast")) return "food";
  return "work";
}

function overlaps(a,b) {
  return a.start < b.end && a.end > b.start;
}

/* ───── days ───── */

const days = [];
const dayMap = {};

for (
  let d = new Date("2026-01-01");
  d <= new Date("2026-12-31");
  d.setDate(d.getDate() + 1)
) {
  const iso = d.toISOString().slice(0,10);
  const label = d.toLocaleDateString("en-GB");
  const day = { iso, label, events: [], dotTimes: [], wake:null, sleep:null };
  days.push(day);
  dayMap[iso] = day;
}

/* ───── load data ───── */

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
      const end   = em[2] ? normalize(toMinutes(em[2])) : start + 10;
      currentDay.events.push({ start, end, label: em[3] });
    });

    days.forEach(d => {
      if (d.dotTimes.length) {
        d.wake = d.dotTimes[0];
        d.sleep = d.dotTimes[d.dotTimes.length - 1];
      }
    });

    days.forEach((day,i) => renderDay(day,i));
  });

/* ───── layout logic (unchanged) ───── */

function layoutEvents(events) {
  events.forEach(e => {
    let maxSimul = 1;
    events.forEach(o => {
      if (e!==o && overlaps(e,o)) maxSimul++;
    });
    e.kind = maxSimul >=3 ? "third" : maxSimul===2 ? "half" : "full";
  });

  events.sort((a,b)=>a.start-b.start);
  const laneEnd=[-1,-1,-1];
  events.forEach(e=>{
    let lane=0;
    while(lane<3 && laneEnd[lane]>e.start) lane++;
    e.lane=lane>2?2:lane;
    laneEnd[e.lane]=e.end;
  });
}

/* ───── render ───── */

function renderDay(day, dayIndex) {
  const row = document.createElement("div");
  row.className = "day-row";
  row.style.height = `${DAY_HEIGHT}px`;

  const label = document.createElement("div");
  label.className = "day-label";
  label.textContent = day.label;
  row.appendChild(label);

  addSleepBlocks(row, day, dayIndex);

  layoutEvents(day.events);

  const PAD = DAY_HEIGHT * PAD_FRAC;
  const GAP = DAY_HEIGHT * GAP_FRAC;

  day.events.forEach(e=>{
    const div=document.createElement("div");
    div.className=`event ${classify(e.label)}`;
    div.textContent=e.label;

    div.style.left  = `${((e.start-DAY_START)/DAY_SPAN)*100}%`;
    div.style.width= `${((e.end-e.start)/DAY_SPAN)*100}%`;
    div.style.top   = `${PAD}px`;
    div.style.height= `${DAY_HEIGHT-2*PAD}px`;

    row.appendChild(div);
  });

  timeline.appendChild(row);
}

/* ───── sleep continuity (CORRECT) ───── */

function addSleepBlocks(row, day, dayIndex) {
  const spanEnd = DAY_START + DAY_SPAN;
  const prev = days[dayIndex-1];
  const next = days[dayIndex+1];

  function addBlock(start,end,roundL,roundR){
    const s=Math.max(start,DAY_START);
    const e=Math.min(end,spanEnd);
    if(e<=s) return;

    const d=document.createElement("div");
    d.className="sleep-bg";
    if(roundL) d.classList.add("round-left");
    if(roundR) d.classList.add("round-right");

    d.style.left=`${((s-DAY_START)/DAY_SPAN)*100}%`;
    d.style.width=`${((e-s)/DAY_SPAN)*100}%`;
    row.appendChild(d);
  }

  if(day.wake>DAY_START){
    const ps=prev?.sleep;
    addBlock(DAY_START,day.wake, ps>day.wake, ps<=day.wake);
  }

  if(day.sleep<spanEnd){
    const nw=next?.wake;
    addBlock(day.sleep,spanEnd, nw>=day.sleep, nw<day.sleep);
  }
}
