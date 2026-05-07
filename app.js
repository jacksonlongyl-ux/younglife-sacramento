'use strict';

/* ─────────────────────────────────────────────────────────────────────
   Young Life · Sacramento County — Ministry Map
   ───────────────────────────────────────────────────────────────────── */

const PROGRESS_STEPS = [
  { key: 'exploring',         label: 'Exploring' },
  { key: 'leader_identified', label: 'Leader Identified' },
  { key: 'club_launched',     label: 'Club Launched' }
];

const DEMO_COLORS = {
  hispanic:  '#c08a2a',
  asian:     '#1d6c95',
  black:     '#7e5c8e',
  white:     '#4f8c2f',
  filipino:  '#b04a3a',
  twoOrMore: '#2a8a8a',
  other:     '#8a8a8a'
};

const STATE_AVG = (typeof window !== 'undefined' && window.STATE_AVERAGES) || { ela: 47, math: 35 };

const TYPE_LETTER = { HS: 'YL', MS: 'WL', College: 'C', YLOne: 'Y1', Capernaum: 'Cp' };
const TYPE_CLASS  = { HS: 't-yl', MS: 't-wl', College: 't-col', YLOne: 't-yl1', Capernaum: 't-cap' };
const TYPE_LABEL  = { HS: 'Young Life', MS: 'Wyldlife', College: 'College YL', YLOne: 'YL One', Capernaum: 'Capernaum' };

const DISTRICT_API = 'https://services3.arcgis.com/fdvHcZVgB2QSRNkL/arcgis/rest/services/SchoolDistrictAreas2425/FeatureServer/0/query'
  + '?where=CountyName%3D%27Sacramento%27&outFields=DistrictName&outSR=4326&f=geojson&resultRecordCount=100';

let map;
let leafletMarkers = {};
let boundaryLayer = null;
let districtGeoJSON = null;
let boundariesOn = false;
let activeFilter = 'all';
let searchQuery = '';
let openSchoolId = null;
let compareList = [];
let comparePanelOpen = false;
let activeSchools = (typeof YL_SCHOOLS !== 'undefined') ? YL_SCHOOLS : [];

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  plotSchools();
  wireControls();
  updateVisionStrip();
  // Apply default appearance classes
  document.body.classList.add('d-spacious', 'mk-style-pin');
});

/* ── MAP ─────────────────────────────────────────────────────── */
function initMap() {
  map = L.map('map', {
    center: [38.52, -121.38],
    zoom: 11,
    zoomControl: false,
    attributionControl: true
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  setBasemap('paper');
  map.on('click', () => closeSidebar());
}

let basemapLayer;
const BASEMAPS = {
  paper:   'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
  light:   'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  muted:   'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
  labels:  'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
};
let labelLayer = null;
function setBasemap(kind) {
  if (basemapLayer) map.removeLayer(basemapLayer);
  if (labelLayer)   map.removeLayer(labelLayer);
  basemapLayer = L.tileLayer(BASEMAPS[kind] || BASEMAPS.paper, {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);
  if (kind === 'paper' || kind === 'muted') {
    labelLayer = L.tileLayer(BASEMAPS.labels, { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
  }
}

function plotSchools() {
  Object.values(leafletMarkers).forEach(m => map.removeLayer(m));
  leafletMarkers = {};
  // Sort so YLOne / Capernaum render after HS pins → DOM order puts them on top
  const ordered = [...activeSchools].sort((a, b) => priority(a) - priority(b));
  ordered.forEach(s => addMarker(s));
}

function priority(s) {
  if (s.status === 'target') return 0;
  if (s.type === 'YLOne' || s.type === 'Capernaum') return 3;
  if (s.type === 'College') return 2;
  return 1;
}

function addMarker(school) {
  // YL One / Capernaum sit on top of everything else (active ministries get visual priority)
  const z =
    school.type === 'YLOne' || school.type === 'Capernaum' ? 2000 :
    school.status === 'target' ? 1500 :
    school.type === 'College' ? 800 : 0;
  const marker = L.marker([school.lat, school.lng], {
    icon: buildIcon(school, false),
    title: school.name,
    zIndexOffset: z,
    riseOnHover: true
  });
  marker.on('click', e => { L.DomEvent.stopPropagation(e); openSidebar(school); });
  marker.on('mouseover', e => showTooltip(e, school));
  marker.on('mouseout', () => hideTooltip());
  marker.addTo(map);
  leafletMarkers[school.id] = marker;
}

/* ── MARKERS ─────────────────────────────────────────────────── */
function buildIcon(school, selected) {
  const isExisting = school.status === 'existing' || school.type === 'Capernaum';
  const cls = [
    'mk',
    isExisting ? 'existing' : 'target',
    TYPE_CLASS[school.type] || 't-yl',
    selected ? 'sel' : ''
  ].join(' ');
  const letter = TYPE_LETTER[school.type] || 'YL';
  return L.divIcon({
    className: '',
    html: `<div class="${cls}"><div class="core"><span>${letter}</span></div></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18]
  });
}

function refreshMarkerIcon(school) {
  const m = leafletMarkers[school.id];
  if (m) m.setIcon(buildIcon(school, openSchoolId === school.id));
}

/* ── TOOLTIP ─────────────────────────────────────────────────── */
function showTooltip(e, school) {
  const el = document.getElementById('tooltip');
  const status = school.status === 'existing' || school.type === 'Capernaum' ? 'Active · ' + (TYPE_LABEL[school.type]||'') : 'Target · ' + (TYPE_LABEL[school.type]||'');
  const enroll = school.enrollment ? `${school.enrollment.toLocaleString()} students` : '';
  const prog = progressText(school);
  el.innerHTML = `
    <div class="t-name">${school.shortName}</div>
    <div class="t-sub">${status}${prog ? ' · ' + prog : ''}</div>
    ${enroll ? `<div class="t-meta">${enroll}</div>` : ''}
  `;
  el.style.left = `${e.originalEvent.clientX}px`;
  el.style.top = `${e.originalEvent.clientY}px`;
  el.style.display = 'block';
}
function hideTooltip() { document.getElementById('tooltip').style.display = 'none'; }
function progressText(s) {
  if (s.status === 'existing') return '';
  return ({ exploring:'Exploring', leader_identified:'Leader Identified', club_launched:'Club Launched' })[s.progress] || '';
}

/* ── SIDEBAR ─────────────────────────────────────────────────── */
function openSidebar(school) {
  const prev = openSchoolId;
  openSchoolId = school.id;
  if (prev && prev !== school.id) {
    const ps = activeSchools.find(s => s.id === prev);
    if (ps) refreshMarkerIcon(ps);
  }
  refreshMarkerIcon(school);
  document.getElementById('sidebarContent').innerHTML = renderSidebar(school);
  document.getElementById('sidebar').classList.add('open');
  const addBtn = document.getElementById('addCmpBtn');
  if (addBtn) addBtn.addEventListener('click', () => toggleCompare(school));
  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
  const staffEl = document.querySelector('.sc-staff');
  if (staffEl) staffEl.addEventListener('click', e => { e.stopPropagation(); openStaffCard(school.staffPerson, staffEl); });
}

function closeSidebar() {
  if (!openSchoolId) return;
  const prev = activeSchools.find(s => s.id === openSchoolId);
  openSchoolId = null;
  if (prev) refreshMarkerIcon(prev);
  document.getElementById('sidebar').classList.remove('open');
}

function renderSidebar(sc) {
  const inCmp = compareList.some(s => s.id === sc.id);
  const isExisting = sc.status === 'existing' || sc.type === 'Capernaum';
  const initials = sc.shortName.split(/[\s,\-]+/).map(w => w[0]).filter(Boolean).slice(0,3).join('').toUpperCase();

  const enrollVal = sc.enrollment ? sc.enrollment.toLocaleString() : '—';
  const ela = sc.testScores?.ela ?? null;
  const math = sc.testScores?.math ?? null;
  const frpm = sc.frpm;
  const frpmKpiCls = frpm == null ? '' : frpm >= 60 ? 'high' : frpm >= 35 ? 'warn' : 'good';
  const elaKpiCls  = ela == null ? '' : ela >= 50 ? 'good' : ela >= 35 ? 'warn' : 'high';
  const mathKpiCls = math == null ? '' : math >= 50 ? 'good' : math >= 35 ? 'warn' : 'high';

  const kpiHtml = sc.type === 'College' || sc.type === 'YLOne' || sc.type === 'Capernaum'
    ? `
      <div class="kpi"><div class="v">${enrollVal}</div><div class="l">Enrollment</div></div>
      ${sc.pellGrant != null ? `<div class="kpi"><div class="v warn">${sc.pellGrant}%</div><div class="l">Pell Grant</div></div>` : `<div class="kpi"><div class="v">—</div><div class="l">Pell</div></div>`}
      ${sc.graduationRate != null ? `<div class="kpi"><div class="v">${sc.graduationRate}%</div><div class="l">Graduation</div></div>` : `<div class="kpi"><div class="v">—</div><div class="l">Graduation</div></div>`}
      <div class="kpi"><div class="v">${TYPE_LABEL[sc.type]?.split(' ')[0] || '—'}</div><div class="l">Ministry</div></div>
    `
    : `
      <div class="kpi"><div class="v">${enrollVal}</div><div class="l">Students</div></div>
      <div class="kpi"><div class="v ${frpmKpiCls}">${frpm != null ? frpm + '%' : '—'}</div><div class="l">Free Lunch</div></div>
      <div class="kpi"><div class="v ${elaKpiCls}">${ela  != null ? ela  + '%' : '—'}</div><div class="l">ELA Prof.</div></div>
      <div class="kpi"><div class="v ${mathKpiCls}">${math != null ? math + '%' : '—'}</div><div class="l">Math Prof.</div></div>
    `;

  return `
    <div class="sb-actions">
      <button id="printBtn" title="Print"><svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v4H6v-4z"/></svg> Print</button>
      <button class="sb-close" id="sbClose">×</button>
    </div>

    <div class="sc-head">
      <div class="sc-eyebrow">
        <span>${TYPE_LABEL[sc.type] || 'Ministry'}</span>
        <span class="sep">·</span>
        <span>${sc.grades || (sc.type === 'College' ? 'College' : '—')}</span>
        ${sc.address ? `<span class="sep">·</span><span>${(sc.address.split(',')[1]||'').trim()}</span>` : ''}
      </div>
      <h1 class="sc-name">${sc.name}</h1>
      <div class="sc-district">${sc.district}</div>
      ${sc.staffPerson ? `<div class="sc-staff">
        <div class="sc-staff-avatar">${(sc.staffPerson.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase())}</div>
        <div>${sc.staffPerson}<br><small>YL Staff</small></div>
      </div>` : ''}
    </div>

    ${sc.status === 'target' ? readinessStepper(sc) : ''}
    ${sc.notes ? notesCallout(sc.notes) : ''}

    <div class="kpi-strip">${kpiHtml}</div>

    ${missionSection(sc)}
    ${(sc.demographics && Object.values(sc.demographics).some(v => v > 0)) ? demoSection(sc.demographics) : ''}
    ${(ela != null || math != null) ? scoresSection(sc.testScores) : ''}
    ${sc.medianIncome ? incomeSection(sc.medianIncome) : ''}
    ${detailSection(sc)}

    <button id="addCmpBtn" class="add-cmp ${inCmp ? 'added' : ''}">
      ${inCmp ? '✓ Added to Comparison' : 'Add to Comparison'}
    </button>

    <div class="data-note">
      Source: CA Dept. of Education SARC 2023–24 · CAASPP 2023–24 · EdData.org. Figures approximate, for planning purposes.
    </div>
  `;
}

function readinessStepper(sc) {
  const prog = sc.progress || 'not_started';
  const idx = ['exploring','leader_identified','club_launched'].indexOf(prog);
  const steps = PROGRESS_STEPS.map((step, i) => {
    const done = i < idx, active = i === idx;
    const cls = done ? 'done' : active ? 'active' : '';
    return `<div class="rs-step ${cls}"><div class="rs-dot"></div><span>${step.label}</span></div>` +
      (i < PROGRESS_STEPS.length - 1 ? `<div class="rs-line ${done ? 'done' : ''}"></div>` : '');
  }).join('');
  const label = prog === 'not_started'
    ? 'On our radar — no active steps yet.'
    : `Currently: <strong>${PROGRESS_STEPS.find(s => s.key === prog)?.label || prog}</strong>`;
  return `<div class="readiness">
    <div class="readiness-label">Ministry Readiness</div>
    ${prog !== 'not_started' ? `<div class="rs-track">${steps}</div>` : ''}
    <div class="readiness-sublabel">${label}</div>
  </div>`;
}

function notesCallout(notes) {
  return `<div class="notes-callout">
    <div class="nc-quote">${notes}</div>
    <div class="nc-attr">Field note</div>
  </div>`;
}

function missionSection(sc) {
  const items = [];
  if (sc.graduationRate != null && sc.type === 'HS') {
    const c = sc.graduationRate >= 90 ? 'good' : sc.graduationRate >= 80 ? 'warn' : 'high';
    items.push({ label: 'Graduation Rate', value: `${sc.graduationRate}%`, cls: c });
  }
  if (sc.chronicAbsenteeism != null) {
    const c = sc.chronicAbsenteeism <= 10 ? 'good' : sc.chronicAbsenteeism <= 20 ? 'warn' : 'high';
    items.push({ label: 'Chronic Absenteeism', value: `${sc.chronicAbsenteeism}%`, cls: c });
  }
  if (sc.suspensionRate != null) {
    const c = sc.suspensionRate <= 2 ? 'good' : sc.suspensionRate <= 5 ? 'warn' : 'high';
    items.push({ label: 'Suspension Rate', value: `${sc.suspensionRate}%`, cls: c });
  }
  if (sc.collegeCareerReady != null) {
    const c = sc.collegeCareerReady >= 50 ? 'good' : sc.collegeCareerReady >= 35 ? 'warn' : 'high';
    items.push({ label: 'College & Career Ready', value: `${sc.collegeCareerReady}%`, cls: c });
  }
  if (!items.length) return '';
  return `<div class="section">
    <div class="sec-title">School Context</div>
    <div class="mission-grid">
      ${items.map(it => `<div class="mission-cell">
        <span class="mission-lbl">${it.label}</span>
        <span class="mission-val ${it.cls}">${it.value}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function demoSection(demo) {
  const rows = [
    ['hispanic','Hispanic / Latino'],['asian','Asian'],['black','Black / African Am.'],
    ['white','White'],['filipino','Filipino'],['twoOrMore','Two or More Races'],['other','Other']
  ].filter(([k]) => (demo[k]||0) > 0).map(([k,label]) => {
    const pct = demo[k]||0;
    return `<div class="demo-row">
      <div class="demo-top"><span>${label}</span><span class="pct">${pct}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${DEMO_COLORS[k]}"></div></div>
    </div>`;
  }).join('');
  return `<div class="section"><div class="sec-title">Student Demographics</div>${rows}</div>`;
}

function scoresSection(scores) {
  const items = [{key:'ela',label:'ELA',avg:STATE_AVG.ela},{key:'math',label:'Math',avg:STATE_AVG.math}];
  const rows = items.map(({key,label,avg}) => {
    const v = scores[key]; if (v == null) return '';
    const c = v >= 50 ? '#4f8c2f' : v >= 35 ? '#c08a2a' : '#b04a3a';
    return `<div class="score-row">
      <span class="score-lbl">${label}</span>
      <div class="score-track">
        <div class="score-fill" style="width:${Math.min(v,100)}%;background:${c}"><span>${v}%</span></div>
        <div class="state-line" style="left:${avg}%" title="State Avg ${avg}%"></div>
      </div>
    </div>`;
  }).join('');
  return `<div class="section">
    <div class="sec-title">Proficiency vs. State</div>
    ${rows}
    <div class="state-note">Marker = CA average · ELA ${STATE_AVG.ela}% · Math ${STATE_AVG.math}%</div>
  </div>`;
}

function incomeSection(income) {
  const min = 30000, max = 150000;
  const pct = Math.min(Math.max(((income - min) / (max - min)) * 100, 2), 100);
  return `<div class="section">
    <div class="sec-title">Neighborhood Income</div>
    <div class="income-lbl"><span>Median household</span><strong>$${income.toLocaleString()}</strong></div>
    <div class="income-track"><div class="income-marker" style="left:${pct}%"></div></div>
    <div class="income-scale"><span>$30K</span><span>County median ~$72K</span><span>$150K+</span></div>
  </div>`;
}

function detailSection(sc) {
  const rows = [];
  if (sc.address)            rows.push(['Address', sc.address]);
  if (sc.attendance)         rows.push(['Attendance', `${sc.attendance}%`]);
  if (sc.englishLearners != null) rows.push(['English Learners', `${sc.englishLearners}%`]);
  if (sc.specialEd != null)  rows.push(['Special Education', `${sc.specialEd}%`]);
  if (!rows.length) return '';
  return `<div class="section">
    <div class="sec-title">Details</div>
    ${rows.map(([k,v]) => `<div class="info-row"><span class="info-k">${k}</span><span class="info-v">${v}</span></div>`).join('')}
  </div>`;
}

/* ── STAFF CARD ──────────────────────────────────────────────── */
function openStaffCard(name, anchorEl) {
  const staff = (typeof YL_STAFF !== 'undefined') ? YL_STAFF[name] : null;
  if (!staff) return;
  const card = document.getElementById('staffCard');
  document.getElementById('staffName').textContent = staff.name;
  document.getElementById('staffTitle').textContent = `${staff.title} · ${staff.org}`;
  const phoneEl = document.getElementById('staffPhone');
  if (staff.phone) {
    const p = staff.phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    document.getElementById('staffPhoneText').textContent = p;
    phoneEl.href = `tel:${staff.phone}`;
    phoneEl.style.display = '';
  } else { phoneEl.style.display = 'none'; }
  const emailEl = document.getElementById('staffEmail');
  if (staff.email) {
    document.getElementById('staffEmailText').textContent = staff.email;
    emailEl.href = `mailto:${staff.email}`;
    emailEl.style.display = '';
  } else { emailEl.style.display = 'none'; }
  const r = anchorEl.getBoundingClientRect();
  card.style.top = `${r.bottom + 8}px`;
  card.style.left = `${Math.min(r.left, window.innerWidth - 290)}px`;
  card.classList.remove('hidden');
}

/* ── VISION STRIP ─────────────────────────────────────────────── */
function updateVisionStrip() {
  const exist = activeSchools.filter(s => s.status === 'existing');
  const tgts  = activeSchools.filter(s => s.status === 'target');
  const eS = exist.reduce((a,s) => a + (s.enrollment||0), 0);
  const tS = tgts.reduce((a,s) => a + (s.enrollment||0), 0);
  document.getElementById('vsActive').textContent = exist.length;
  document.getElementById('vsActiveStudents').textContent = `~${(Math.round(eS/100)*100).toLocaleString()} students on campus`;
  document.getElementById('vsTarget').textContent = tgts.length;
  document.getElementById('vsTargetStudents').textContent = `~${(Math.round(tS/100)*100).toLocaleString()} students still ahead`;
}

/* ── SEARCH / FILTER ─────────────────────────────────────────── */
function applySearch(q) {
  searchQuery = q.toLowerCase().trim();
  document.getElementById('searchClear').style.display = searchQuery ? 'flex' : 'none';
  applyFilter();
  if (searchQuery) {
    const m = activeSchools.find(s =>
      s.name.toLowerCase().includes(searchQuery) ||
      s.shortName.toLowerCase().includes(searchQuery) ||
      s.district.toLowerCase().includes(searchQuery));
    if (m) map.setView([m.lat, m.lng], 14);
  }
}
function applyFilter() {
  activeSchools.forEach(sc => {
    const m = leafletMarkers[sc.id]; if (!m) return;
    const f = activeFilter === 'all'
      || (activeFilter === 'younglife'  && sc.type === 'HS')
      || (activeFilter === 'wyldlife'   && sc.type === 'MS')
      || (activeFilter === 'college'    && sc.type === 'College')
      || (activeFilter === 'ylone'      && sc.type === 'YLOne')
      || (activeFilter === 'capernaum'  && sc.type === 'Capernaum');
    const s = !searchQuery
      || sc.name.toLowerCase().includes(searchQuery)
      || sc.shortName.toLowerCase().includes(searchQuery)
      || sc.district.toLowerCase().includes(searchQuery);
    const show = f && s;
    if (show && !map.hasLayer(m)) m.addTo(map);
    if (!show && map.hasLayer(m)) map.removeLayer(m);
  });
}

/* ── COMPARE ─────────────────────────────────────────────────── */
function toggleCompare(school) {
  const idx = compareList.findIndex(s => s.id === school.id);
  if (idx > -1) compareList.splice(idx, 1);
  else {
    if (compareList.length >= 4) { alert('Up to 4 schools.'); return; }
    compareList.push(school);
  }
  updateCompareBtnState(school.id);
  updateCompareCounter();
  if (comparePanelOpen) renderCompare();
}
function updateCompareBtnState(id) {
  const btn = document.getElementById('addCmpBtn'); if (!btn) return;
  const inL = compareList.some(s => s.id === id);
  btn.className = `add-cmp${inL ? ' added' : ''}`;
  btn.textContent = inL ? '✓ Added to Comparison' : 'Add to Comparison';
}
function updateCompareCounter() {
  const n = compareList.length;
  const btn = document.getElementById('compareBtn');
  btn.disabled = n < 2;
  btn.textContent = n >= 2 ? `Compare (${n})` : 'Compare';
}
function toggleComparePanel() {
  comparePanelOpen = !comparePanelOpen;
  document.getElementById('comparePanel').classList.toggle('open', comparePanelOpen);
  if (comparePanelOpen) renderCompare();
}
function renderCompare() {
  const body = document.getElementById('cmpBody');
  if (compareList.length < 2) {
    body.innerHTML = `<div class="cmp-empty">Add at least 2 schools to compare.</div>`; return;
  }
  const metrics = {enrollment:1,frpm:0,ela:1,math:1,graduationRate:1,chronicAbsenteeism:0,medianIncome:1};
  const ext = {};
  Object.keys(metrics).forEach(m => {
    const vals = compareList.map(s => m === 'ela' ? s.testScores?.ela : m === 'math' ? s.testScores?.math : s[m])
      .filter(v => v != null);
    if (vals.length < 2) return;
    ext[m] = { best: metrics[m] ? Math.max(...vals) : Math.min(...vals),
               worst: metrics[m] ? Math.min(...vals) : Math.max(...vals) };
  });
  const cl = (m,v) => !ext[m] || v == null ? '' : v === ext[m].best ? ' best' : v === ext[m].worst ? ' worst' : '';
  body.innerHTML = compareList.map(sc => {
    const isE = sc.status === 'existing' || sc.type === 'Capernaum';
    return `<div class="cmp-card">
      <span class="cmp-card-tag ${isE ? 'existing' : 'target'}"><span class="dot"></span>${isE ? 'Active' : 'Target'} · ${TYPE_LABEL[sc.type]||''}</span>
      <div class="cmp-card-name">${sc.shortName}</div>
      <div class="cmp-card-dist">${sc.district}</div>
      ${ent('Enrollment', sc.enrollment ? sc.enrollment.toLocaleString() : '—', cl('enrollment',sc.enrollment))}
      ${ent('Free Lunch', sc.frpm != null ? sc.frpm + '%' : '—', cl('frpm',sc.frpm))}
      ${ent('ELA Prof.', sc.testScores?.ela != null ? sc.testScores.ela + '%' : '—', cl('ela',sc.testScores?.ela))}
      ${ent('Math Prof.', sc.testScores?.math != null ? sc.testScores.math + '%' : '—', cl('math',sc.testScores?.math))}
      ${ent('Graduation', sc.graduationRate != null ? sc.graduationRate + '%' : '—', cl('graduationRate',sc.graduationRate))}
      ${ent('Chronic Abs.', sc.chronicAbsenteeism != null ? sc.chronicAbsenteeism + '%' : '—', cl('chronicAbsenteeism',sc.chronicAbsenteeism))}
      ${ent('Median Inc.', sc.medianIncome ? '$' + sc.medianIncome.toLocaleString() : '—', cl('medianIncome',sc.medianIncome))}
      <button class="cmp-rm" onclick="removeFromCompare(${sc.id})">— Remove</button>
    </div>`;
  }).join('');
}
function ent(k,v,cls) { return `<div class="cmp-row"><span class="cmp-k">${k}</span><span class="cmp-v${cls}">${v}</span></div>`; }
function removeFromCompare(id) {
  compareList = compareList.filter(s => s.id !== id);
  updateCompareCounter(); renderCompare();
  if (openSchoolId === id) updateCompareBtnState(id);
}
window.removeFromCompare = removeFromCompare;

/* ── BOUNDARIES ──────────────────────────────────────────────── */
async function toggleBoundaries() {
  boundariesOn = !boundariesOn;
  const btn = document.getElementById('boundaryBtn');
  if (!boundariesOn) {
    btn.classList.remove('active');
    btn.textContent = 'Districts';
    if (boundaryLayer) map.removeLayer(boundaryLayer);
    return;
  }
  btn.classList.add('active');
  btn.textContent = 'Loading…';
  if (!districtGeoJSON) {
    try {
      const r = await fetch(DISTRICT_API);
      districtGeoJSON = await r.json();
    } catch(e) {
      btn.classList.remove('active'); btn.textContent = 'Districts';
      boundariesOn = false; alert('Could not load district boundaries.'); return;
    }
  }
  const existing = new Set(activeSchools.filter(s => s.status === 'existing').map(s => s.district));
  const has = n => [...existing].some(d => d.includes(n) || n.includes(d.split(' ')[0]));
  const summary = n => {
    const ss = activeSchools.filter(s => s.district.toLowerCase().includes(n.toLowerCase().split(' ')[0]));
    const a = ss.filter(s => s.status === 'existing');
    const t = ss.filter(s => s.status === 'target');
    return { a, t, e: a.reduce((sum, s) => sum + (s.enrollment||0), 0) };
  };
  boundaryLayer = L.geoJSON(districtGeoJSON, {
    style(f) {
      const h = has(f.properties.DistrictName);
      return { color: h ? '#003A5B' : '#91C83E', fillColor: h ? '#003A5B' : '#91C83E',
        fillOpacity: 0.06, weight: 1.8, dashArray: '6 4', opacity: 0.7 };
    },
    onEachFeature(f, layer) {
      const n = f.properties.DistrictName;
      layer.bindTooltip(`<strong>${n}</strong><br>${has(n) ? 'Active YL presence' : 'Opportunity district'}`, { sticky: true, className: 'district-tip' });
      layer.on('click', e => {
        L.DomEvent.stopPropagation(e);
        const { a, t, e: er } = summary(n);
        L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(`
          <div class="district-popup">
            <div class="dp-title">${n}</div>
            ${a.length ? `<div class="dp-section"><strong>Active (${a.length})</strong><ul>${a.map(s=>`<li>${s.shortName}</li>`).join('')}</ul>${er?`<div class="dp-reach">${er.toLocaleString()} students reached</div>`:''}</div>`:''}
            ${t.length ? `<div class="dp-section"><strong>Targets (${t.length})</strong><ul>${t.map(s=>`<li>${s.shortName} ${progressText(s)?`<em>${progressText(s)}</em>`:''}</li>`).join('')}</ul></div>`:''}
            ${!a.length && !t.length ? '<div class="dp-section" style="color:#8a8a8a">No YL schools in this district yet.</div>':''}
          </div>
        `).openOn(map);
      });
    }
  }).addTo(map);
  btn.textContent = 'Districts';
}

/* ── CONTROLS ────────────────────────────────────────────────── */
function wireControls() {
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      activeFilter = b.dataset.filter;
      applyFilter();
    });
  });
  document.getElementById('boundaryBtn').addEventListener('click', toggleBoundaries);
  document.getElementById('compareBtn').addEventListener('click', toggleComparePanel);
  document.getElementById('cmpClose').addEventListener('click', () => {
    comparePanelOpen = false;
    document.getElementById('comparePanel').classList.remove('open');
  });
  document.getElementById('cmpClear').addEventListener('click', () => {
    compareList = []; updateCompareCounter(); renderCompare();
    if (openSchoolId) updateCompareBtnState(openSchoolId);
  });
  const si = document.getElementById('searchInput');
  si.addEventListener('input', e => applySearch(e.target.value));
  si.addEventListener('keydown', e => { if (e.key === 'Escape') { si.value=''; applySearch(''); }});
  document.getElementById('searchClear').addEventListener('click', () => {
    si.value = ''; applySearch(''); si.focus();
  });
  document.getElementById('staffCardClose').addEventListener('click', () => document.getElementById('staffCard').classList.add('hidden'));
  document.addEventListener('click', e => {
    const c = document.getElementById('staffCard');
    if (!c.classList.contains('hidden') && !c.contains(e.target) && !e.target.closest('.sc-staff')) {
      c.classList.add('hidden');
    }
  });
  document.addEventListener('click', e => {
    if (e.target?.id === 'sbClose') closeSidebar();
  });
}

