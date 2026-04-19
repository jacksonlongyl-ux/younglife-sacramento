'use strict';

// ── CONFIG ────────────────────────────────────────────────────────────────

const NAVY = '#003057';
const RED  = '#C8102E';
const BLUE = '#009FD4';

const DEMO_COLORS = {
  hispanic:  '#f97316',
  asian:     '#3b82f6',
  black:     '#8b5cf6',
  white:     '#10b981',
  filipino:  '#ec4899',
  twoOrMore: '#14b8a6',
  other:     '#94a3b8'
};

// ── STATE ─────────────────────────────────────────────────────────────────

// CA DOE ArcGIS service — 2024-25 school district boundaries
const DISTRICT_API = 'https://services3.arcgis.com/fdvHcZVgB2QSRNkL/arcgis/rest/services/SchoolDistrictAreas2425/FeatureServer/0/query'
  + '?where=CountyName%3D%27Sacramento%27+AND+DistrictName+IN+(%27Sacramento+City+Unified%27%2C%27Elk+Grove+Unified%27%2C%27Natomas+Unified%27%2C%27San+Juan+Unified%27%2C%27Folsom-Cordova+Unified%27)'
  + '&outFields=DistrictName&outSR=4326&f=geojson';

let map;
let leafletMarkers  = {};
let boundaryLayer   = null;   // L.geoJSON layer for district polygons
let districtGeoJSON = null;   // cached fetch result
let boundariesOn    = false;
let activeFilter    = 'all';
let openSchoolId    = null;
let compareList     = [];
let comparePanelOpen = false;
let activeSchools   = YL_SCHOOLS; // may be replaced by Sheets data

// ── INIT ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadSchoolData();   // try Sheets first, fall back to built-in
  plotSchools();
  wireControls();
  updateHeaderStats();
});

// ── GOOGLE SHEETS SYNC ────────────────────────────────────────────────────

async function loadSchoolData() {
  if (!SHEETS_URL || SHEETS_URL.trim() === '') return;

  try {
    const res  = await fetch(SHEETS_URL);
    const text = await res.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return;

    const headers = rows[0].map(h => h.trim());
    const parsed  = rows.slice(1).filter(r => r.length > 1).map(row => {
      const o = {};
      headers.forEach((h, i) => o[h] = row[i] ? row[i].trim() : '');
      return {
        id:            Number(o.id),
        name:          o.name,
        shortName:     o.shortName || o.name,
        type:          o.type,
        status:        o.status,
        lat:           Number(o.lat),
        lng:           Number(o.lng),
        district:      o.district,
        grades:        o.grades,
        address:       o.address,
        enrollment:          o.enrollment          ? Number(o.enrollment)          : null,
        frpm:                o.frpm                ? Number(o.frpm)                : null,
        attendance:          o.attendance          ? Number(o.attendance)          : null,
        chronicAbsenteeism:  o.chronicAbsenteeism  ? Number(o.chronicAbsenteeism)  : null,
        suspensionRate:      o.suspensionRate       ? Number(o.suspensionRate)      : null,
        graduationRate:      o.graduationRate       ? Number(o.graduationRate)      : null,
        collegeCareerReady:  o.collegeCareerReady   ? Number(o.collegeCareerReady)  : null,
        englishLearners:     o.englishLearners      ? Number(o.englishLearners)     : null,
        specialEd:           o.specialEd            ? Number(o.specialEd)           : null,
        medianIncome:        o.medianIncome         ? Number(o.medianIncome)        : null,
        demographics: {
          hispanic:  Number(o.hispanic  || 0),
          asian:     Number(o.asian     || 0),
          black:     Number(o.black     || 0),
          white:     Number(o.white     || 0),
          filipino:  Number(o.filipino  || 0),
          twoOrMore: Number(o.twoOrMore || 0),
          other:     Number(o.other     || 0)
        },
        testScores: {
          ela:  o.ela  ? Number(o.ela)  : null,
          math: o.math ? Number(o.math) : null
        }
      };
    });

    activeSchools = parsed;
    document.getElementById('syncStatus').classList.remove('hidden');
  } catch (err) {
    console.warn('Google Sheets sync failed, using built-in data:', err);
  }
}

function parseCSV(text) {
  return text.split('\n').map(line => {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
      cur += c;
    }
    result.push(cur);
    return result;
  });
}

function initMap() {
  map = L.map('map', {
    center: [38.52, -121.35],
    zoom: 11,
    zoomControl: false,
    attributionControl: true
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // CartoDB Positron — clean, gray, free
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Close sidebar when clicking map background
  map.on('click', () => closeSidebar());
}

function plotSchools() {
  activeSchools.forEach(school => {
    const marker = L.marker([school.lat, school.lng], {
      icon: buildIcon(school, false),
      title: school.name
    });

    marker.on('click', e => {
      L.DomEvent.stopPropagation(e);
      openSidebar(school);
    });

    marker.on('mouseover', e => showTooltip(e, school));
    marker.on('mouseout',  ()  => hideTooltip());

    marker.addTo(map);
    leafletMarkers[school.id] = marker;
  });
}

// ── MARKERS ───────────────────────────────────────────────────────────────

function buildIcon(school, selected) {
  const sel = selected ? ' sel' : '';
  if (school.status === 'existing') {
    return L.divIcon({
      className: '',
      html: `<div class="mk-existing${sel}"><div class="pin"><span class="txt">YL</span></div></div>`,
      iconSize:   [34, 42],
      iconAnchor: [17, 42],
      popupAnchor:[0, -44]
    });
  }
  return L.divIcon({
    className: '',
    html: `<div class="mk-target${sel}"><div class="ring"><div class="dot"></div></div></div>`,
    iconSize:   [28, 28],
    iconAnchor: [14, 14],
    popupAnchor:[0, -16]
  });
}

function refreshMarkerIcon(school) {
  const marker = leafletMarkers[school.id];
  if (marker) marker.setIcon(buildIcon(school, openSchoolId === school.id));
}

// ── TOOLTIP ───────────────────────────────────────────────────────────────

function showTooltip(e, school) {
  const el = document.getElementById('tooltip');
  const statusText = school.status === 'existing' ? '✓ Existing YL' : '◎ Target School';
  const enrollText = school.enrollment ? `${school.enrollment.toLocaleString()} students` : '';

  el.innerHTML = `
    <div class="t-name">${school.shortName}</div>
    <div class="t-sub">${statusText}</div>
    <div class="t-sub">${school.district}</div>
    ${enrollText ? `<div class="t-sub">${enrollText}</div>` : ''}
  `;

  const px = e.originalEvent.clientX;
  const py = e.originalEvent.clientY;
  el.style.left = `${px}px`;
  el.style.top  = `${py}px`;
  el.style.display = 'block';
}

function hideTooltip() {
  document.getElementById('tooltip').style.display = 'none';
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────

function openSidebar(school) {
  const prev = openSchoolId;
  openSchoolId = school.id;

  // Reset previous marker
  if (prev && prev !== school.id) {
    const prevSchool = YL_SCHOOLS.find(s => s.id === prev);
    if (prevSchool) refreshMarkerIcon(prevSchool);
  }
  refreshMarkerIcon(school);

  document.getElementById('sidebarContent').innerHTML = buildSidebarHTML(school);
  document.getElementById('sidebar').classList.add('open');

  // Wire compare button
  document.getElementById('addCmpBtn').addEventListener('click', () => toggleCompare(school));
}

function closeSidebar() {
  if (!openSchoolId) return;
  const prev = YL_SCHOOLS.find(s => s.id === openSchoolId);
  openSchoolId = null;
  if (prev) refreshMarkerIcon(prev);
  document.getElementById('sidebar').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarClose').addEventListener('click', e => {
    e.stopPropagation();
    closeSidebar();
  });
});

// ── SIDEBAR HTML ──────────────────────────────────────────────────────────

function buildSidebarHTML(sc) {
  const inCmp = compareList.some(s => s.id === sc.id);

  // Type badge
  const typeBadge = (() => {
    if (sc.type === 'HS')      return `<span class="badge b-hs">High School</span>`;
    if (sc.type === 'MS')      return `<span class="badge b-ms">Middle School</span>`;
    if (sc.type === 'College') return `<span class="badge b-college">College / University</span>`;
    return `<span class="badge b-special">Special Program</span>`;
  })();

  const statusBadge = sc.status === 'existing'
    ? `<span class="badge b-existing">✓ Existing YL</span>`
    : `<span class="badge b-target">◎ Target School</span>`;

  const gradesBadge = sc.grades && sc.grades !== 'College'
    ? `<span class="badge b-hs" style="background:#f1f5f9;color:#475569">Grades ${sc.grades}</span>`
    : '';

  // Stats
  const enrollVal = sc.enrollment ? sc.enrollment.toLocaleString() : '—';
  const frpmVal   = sc.frpm   !== null ? `${sc.frpm}%`   : '—';
  const elaVal    = sc.testScores.ela  !== null ? `${sc.testScores.ela}%`  : '—';
  const mathVal   = sc.testScores.math !== null ? `${sc.testScores.math}%` : '—';

  const frpmColor  = colorFRPM(sc.frpm);
  const elaColor   = colorScore(sc.testScores.ela);
  const mathColor  = colorScore(sc.testScores.math);

  return `
    <div class="sc-header">
      <div class="sc-badges">${typeBadge}${statusBadge}${gradesBadge}</div>
      <div class="sc-name">${sc.name}</div>
      <div class="sc-district">${sc.district}</div>
    </div>

    <div class="stats-strip">
      <div class="stat-cell">
        <span class="sv">${enrollVal}</span>
        <span class="sl">Students</span>
      </div>
      <div class="stat-cell">
        <span class="sv" style="color:${frpmColor}">${frpmVal}</span>
        <span class="sl">Free Lunch</span>
      </div>
      <div class="stat-cell">
        <span class="sv" style="color:${elaColor}">${elaVal}</span>
        <span class="sl">ELA Prof.</span>
      </div>
      <div class="stat-cell">
        <span class="sv" style="color:${mathColor}">${mathVal}</span>
        <span class="sl">Math Prof.</span>
      </div>
    </div>

    ${missionSection(sc)}
    ${sc.demographics ? demoSection(sc.demographics) : ''}
    ${sc.testScores.ela !== null ? scoresSection(sc.testScores) : ''}
    ${sc.medianIncome ? incomeSection(sc.medianIncome) : ''}
    ${detailSection(sc)}

    <button id="addCmpBtn" class="add-cmp-btn ${inCmp ? 'added' : ''}">
      ${inCmp ? '✓ Added to Comparison' : '+ Add to Comparison'}
    </button>

    <div class="data-note">
      Data: CA Dept. of Education 2022–23 · US Census ACS estimates · Figures are approximate and for planning purposes.
    </div>
  `;
}

function missionSection(sc) {
  const items = [];

  if (sc.graduationRate !== null && sc.graduationRate !== undefined && sc.type === 'HS') {
    const color = sc.graduationRate >= 90 ? '#16a34a' : sc.graduationRate >= 80 ? '#d97706' : RED;
    items.push({ label: 'Graduation Rate', value: `${sc.graduationRate}%`, color });
  }
  if (sc.chronicAbsenteeism !== null && sc.chronicAbsenteeism !== undefined) {
    const color = sc.chronicAbsenteeism <= 10 ? '#16a34a' : sc.chronicAbsenteeism <= 20 ? '#d97706' : RED;
    items.push({ label: 'Chronic Absenteeism', value: `${sc.chronicAbsenteeism}%`, color });
  }
  if (sc.suspensionRate !== null && sc.suspensionRate !== undefined) {
    const color = sc.suspensionRate <= 2 ? '#16a34a' : sc.suspensionRate <= 5 ? '#d97706' : RED;
    items.push({ label: 'Suspension Rate', value: `${sc.suspensionRate}%`, color });
  }
  if (sc.collegeCareerReady !== null && sc.collegeCareerReady !== undefined) {
    const color = sc.collegeCareerReady >= 50 ? '#16a34a' : sc.collegeCareerReady >= 35 ? '#d97706' : RED;
    items.push({ label: 'College & Career Ready', value: `${sc.collegeCareerReady}%`, color });
  }

  if (items.length === 0) return '';

  return `<div class="section">
    <div class="sec-title">Mission Context</div>
    <div class="mission-grid">
      ${items.map(({ label, value, color }) => `
        <div class="mission-cell">
          <span class="mission-val" style="color:${color}">${value}</span>
          <span class="mission-lbl">${label}</span>
        </div>`).join('')}
    </div>
    <div class="mission-note">Green = healthy · Amber = concern · Red = high need</div>
  </div>`;
}

function demoSection(demo) {
  const rows = [
    { key: 'hispanic',  label: 'Hispanic / Latino' },
    { key: 'asian',     label: 'Asian' },
    { key: 'black',     label: 'Black / African Am.' },
    { key: 'white',     label: 'White' },
    { key: 'filipino',  label: 'Filipino' },
    { key: 'twoOrMore', label: 'Two or More Races' },
    { key: 'other',     label: 'Other' }
  ].filter(({ key }) => (demo[key] || 0) > 0).map(({ key, label }) => {
    const pct = demo[key] || 0;
    return `
      <div class="demo-row">
        <div class="demo-row-top"><span>${label}</span><span>${pct}%</span></div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${DEMO_COLORS[key]}"></div>
        </div>
      </div>`;
  }).join('');

  return `<div class="section">
    <div class="sec-title">Student Demographics</div>
    ${rows}
  </div>`;
}

function scoresSection(scores) {
  const items = [
    { key: 'ela',  label: 'ELA',  avg: STATE_AVERAGES.ela },
    { key: 'math', label: 'Math', avg: STATE_AVERAGES.math }
  ];

  const rows = items.map(({ key, label, avg }) => {
    const val = scores[key];
    if (val === null) return '';
    const color = colorScore(val);
    return `
      <div class="score-row">
        <span class="score-lbl">${label}</span>
        <div class="score-track">
          <div class="score-fill" style="width:${Math.min(val,100)}%;background:${color}">
            <span>${val}%</span>
          </div>
          <div class="state-line" style="left:${avg}%"
               title="CA State Avg ${avg}%"></div>
        </div>
      </div>`;
  }).join('');

  return `<div class="section">
    <div class="sec-title">Test Scores vs. State Average</div>
    ${rows}
    <div class="state-note">Vertical line = CA state avg (ELA ${STATE_AVERAGES.ela}% · Math ${STATE_AVERAGES.math}%)</div>
  </div>`;
}

function incomeSection(income) {
  const min = 30000, max = 150000;
  const pct = Math.round(Math.min(Math.max(((income - min) / (max - min)) * 100, 2), 100));
  return `<div class="section">
    <div class="sec-title">Neighborhood Wealth</div>
    <div class="income-lbl">
      <span>Median Household Income</span>
      <strong>$${income.toLocaleString()}</strong>
    </div>
    <div class="income-track">
      <div class="income-fill" style="width:${pct}%"></div>
    </div>
    <div class="income-scale">
      <span>$30K</span>
      <span class="mid">Sacramento County median: ~$72K</span>
      <span>$150K+</span>
    </div>
  </div>`;
}

function detailSection(sc) {
  const rows = [];
  if (sc.address)                                        rows.push(['Address', sc.address]);
  if (sc.attendance)                                     rows.push(['Attendance Rate', `${sc.attendance}%`]);
  if (sc.englishLearners !== null && sc.englishLearners !== undefined) rows.push(['English Learners', `${sc.englishLearners}%`]);
  if (sc.specialEd !== null && sc.specialEd !== undefined)             rows.push(['Special Education', `${sc.specialEd}%`]);

  return `<div class="section">
    <div class="sec-title">School Details</div>
    ${rows.map(([k, v]) => `
      <div class="info-row">
        <span class="info-k">${k}</span>
        <span class="info-v">${v}</span>
      </div>`).join('')}
  </div>`;
}

// ── COMPARE ───────────────────────────────────────────────────────────────

function toggleCompare(school) {
  const idx = compareList.findIndex(s => s.id === school.id);
  if (idx > -1) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= 4) {
      alert('You can compare up to 4 schools. Remove one first.');
      return;
    }
    compareList.push(school);
  }
  updateCompareBtnState(school.id);
  updateCompareCounter();
  if (comparePanelOpen) renderComparePanel();
}

function updateCompareBtnState(schoolId) {
  const btn = document.getElementById('addCmpBtn');
  if (!btn) return;
  const inList = compareList.some(s => s.id === schoolId);
  btn.className = `add-cmp-btn${inList ? ' added' : ''}`;
  btn.textContent = inList ? '✓ Added to Comparison' : '+ Add to Comparison';
}

function updateCompareCounter() {
  const n = compareList.length;
  const btn = document.getElementById('compareBtn');
  btn.disabled = n < 2;
  btn.textContent = n >= 2 ? `Compare ${n} Schools` : n === 1 ? 'Compare 1 School' : 'Compare Schools';
}

function toggleComparePanel() {
  comparePanelOpen = !comparePanelOpen;
  const panel = document.getElementById('comparePanel');
  if (comparePanelOpen) {
    panel.classList.add('open');
    renderComparePanel();
  } else {
    panel.classList.remove('open');
  }
}

function renderComparePanel() {
  const body = document.getElementById('cmpBody');
  if (compareList.length < 2) {
    body.innerHTML = '<p style="color:#9ca3af;font-size:13px;padding:4px">Add at least 2 schools from the sidebar to compare.</p>';
    return;
  }

  // Compute best/worst per metric (for highlighting)
  const metrics = {
    enrollment:         { higher: true },
    frpm:               { higher: false },
    ela:                { higher: true },
    math:               { higher: true },
    graduationRate:     { higher: true },
    chronicAbsenteeism: { higher: false },
    medianIncome:       { higher: true }
  };

  const extremes = {};
  Object.keys(metrics).forEach(m => {
    const vals = compareList.map(s => {
      if (m === 'ela')  return s.testScores.ela;
      if (m === 'math') return s.testScores.math;
      return s[m];
    }).filter(v => v !== null && v !== undefined);

    if (vals.length < 2) return;
    extremes[m] = {
      best:  metrics[m].higher ? Math.max(...vals) : Math.min(...vals),
      worst: metrics[m].higher ? Math.min(...vals) : Math.max(...vals)
    };
  });

  function cls(metric, val) {
    if (!extremes[metric] || val === null) return '';
    if (val === extremes[metric].best)  return ' best';
    if (val === extremes[metric].worst) return ' worst';
    return '';
  }

  body.innerHTML = compareList.map(sc => {
    const ela  = sc.testScores.ela;
    const math = sc.testScores.math;

    return `
      <div class="cmp-card">
        <div class="cmp-card-name">${sc.shortName}</div>
        <div class="cmp-card-dist">${sc.district}</div>
        <span class="badge ${sc.status === 'existing' ? 'b-existing' : 'b-target'}" style="font-size:9px;margin-bottom:10px;display:inline-block">
          ${sc.status === 'existing' ? 'Existing YL' : 'Target'}
        </span>

        <div class="cmp-row">
          <span class="cmp-k">Enrollment</span>
          <span class="cmp-v${cls('enrollment', sc.enrollment)}">${sc.enrollment ? sc.enrollment.toLocaleString() : '—'}</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-k">Free Lunch %</span>
          <span class="cmp-v${cls('frpm', sc.frpm)}">${sc.frpm !== null ? sc.frpm + '%' : '—'}</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-k">ELA Proficiency</span>
          <span class="cmp-v${cls('ela', ela)}">${ela !== null ? ela + '%' : '—'}</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-k">Math Proficiency</span>
          <span class="cmp-v${cls('math', math)}">${math !== null ? math + '%' : '—'}</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-k">Graduation Rate</span>
          <span class="cmp-v${cls('graduationRate', sc.graduationRate)}">${sc.graduationRate !== null && sc.graduationRate !== undefined ? sc.graduationRate + '%' : '—'}</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-k">Chronic Absenteeism</span>
          <span class="cmp-v${cls('chronicAbsenteeism', sc.chronicAbsenteeism)}">${sc.chronicAbsenteeism !== null && sc.chronicAbsenteeism !== undefined ? sc.chronicAbsenteeism + '%' : '—'}</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-k">Median Income</span>
          <span class="cmp-v${cls('medianIncome', sc.medianIncome)}">${sc.medianIncome ? '$' + sc.medianIncome.toLocaleString() : '—'}</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-k">English Learners</span>
          <span class="cmp-v">${sc.englishLearners !== null && sc.englishLearners !== undefined ? sc.englishLearners + '%' : '—'}</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-k">Attendance Rate</span>
          <span class="cmp-v">${sc.attendance ? sc.attendance + '%' : '—'}</span>
        </div>

        <button class="cmp-remove-btn" onclick="removeFromCompare(${sc.id})">Remove</button>
      </div>
    `;
  }).join('');
}

function removeFromCompare(schoolId) {
  compareList = compareList.filter(s => s.id !== schoolId);
  updateCompareCounter();
  renderComparePanel();
  if (openSchoolId === schoolId) updateCompareBtnState(schoolId);
}

// ── FILTER ────────────────────────────────────────────────────────────────

function applyFilter() {
  activeSchools.forEach(sc => {
    const marker = leafletMarkers[sc.id];
    if (!marker) return;
    const show = activeFilter === 'all'
      || (activeFilter === 'existing' && sc.status === 'existing')
      || (activeFilter === 'target'   && sc.status === 'target');
    if (show && !map.hasLayer(marker)) marker.addTo(map);
    if (!show && map.hasLayer(marker)) map.removeLayer(marker);
  });
}

// ── CONTROLS WIRING ───────────────────────────────────────────────────────

function wireControls() {
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilter();
    });
  });

  // Boundary zones toggle
  document.getElementById('boundaryBtn').addEventListener('click', toggleBoundaries);

  // Compare toggle
  document.getElementById('compareBtn').addEventListener('click', toggleComparePanel);

  // Compare panel close
  document.getElementById('cmpCloseBtn').addEventListener('click', () => {
    comparePanelOpen = false;
    document.getElementById('comparePanel').classList.remove('open');
  });

  // Compare panel clear
  document.getElementById('cmpClearBtn').addEventListener('click', () => {
    compareList = [];
    updateCompareCounter();
    renderComparePanel();
    if (openSchoolId) updateCompareBtnState(openSchoolId);
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────

function colorScore(val) {
  if (val === null) return '#9ca3af';
  if (val >= 50) return '#16a34a';
  if (val >= 35) return '#d97706';
  return RED;
}

function colorFRPM(val) {
  if (val === null) return '#9ca3af';
  if (val >= 60) return RED;
  if (val >= 35) return '#d97706';
  return '#16a34a';
}

function updateHeaderStats() {
  const existing = activeSchools.filter(s => s.status === 'existing').length;
  const target   = activeSchools.filter(s => s.status === 'target').length;
  document.getElementById('statExisting').textContent = existing;
  document.getElementById('statTarget').textContent   = target;
  document.getElementById('statTotal').textContent    = existing + target;
}

// ── SCHOOL BOUNDARY ZONES ─────────────────────────────────────────────────
// Fetches real 2024-25 district boundaries from CA Dept. of Education GIS.

async function toggleBoundaries() {
  boundariesOn = !boundariesOn;
  const btn = document.getElementById('boundaryBtn');

  if (!boundariesOn) {
    btn.classList.remove('active');
    btn.textContent = 'School Zones';
    if (boundaryLayer) map.removeLayer(boundaryLayer);
    return;
  }

  btn.classList.add('active');
  btn.textContent = 'Loading…';

  // Fetch once per session, then cache
  if (!districtGeoJSON) {
    try {
      const res = await fetch(DISTRICT_API);
      if (!res.ok) throw new Error(res.status);
      districtGeoJSON = await res.json();
    } catch (err) {
      console.error('District boundary fetch failed:', err);
      btn.textContent = 'School Zones';
      btn.classList.remove('active');
      boundariesOn = false;
      alert('Could not load district boundaries. Check your internet connection and try again.');
      return;
    }
  }

  // Districts that have at least one existing YL school
  const existingDistricts = new Set(
    activeSchools.filter(s => s.status === 'existing').map(s => s.district)
  );

  // Helper: does the API district name match a school's district string?
  function districtHasExisting(apiName) {
    return [...existingDistricts].some(d => d.includes(apiName) || apiName.includes(d.split(' ')[0]));
  }

  boundaryLayer = L.geoJSON(districtGeoJSON, {
    style(feature) {
      const hasExisting = districtHasExisting(feature.properties.DistrictName);
      return {
        color:       hasExisting ? NAVY : RED,
        fillColor:   hasExisting ? NAVY : RED,
        fillOpacity: 0.07,
        weight:      2.5,
        dashArray:   '7 4',
        opacity:     0.75
      };
    },
    onEachFeature(feature, layer) {
      const name = feature.properties.DistrictName;
      const hasExisting = districtHasExisting(name);
      layer.bindTooltip(
        `<strong>${name}</strong><br>${hasExisting ? '✓ Active YL presence' : '◎ Target district'}`,
        { sticky: true, className: 'district-tip' }
      );
    }
  }).addTo(map);

  btn.textContent = 'School Zones';
}
