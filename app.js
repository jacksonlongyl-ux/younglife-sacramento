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

const PROGRESS_STEPS = [
  { key: 'exploring',        label: 'Exploring' },
  { key: 'leader_identified', label: 'Leader Identified' },
  { key: 'club_launched',    label: 'Club Launched' }
];

// ── STATE ─────────────────────────────────────────────────────────────────

// CA DOE ArcGIS service — 2024-25 school district boundaries (all Sacramento County)
const DISTRICT_API = 'https://services3.arcgis.com/fdvHcZVgB2QSRNkL/arcgis/rest/services/SchoolDistrictAreas2425/FeatureServer/0/query'
  + '?where=CountyName%3D%27Sacramento%27'
  + '&outFields=DistrictName&outSR=4326&f=geojson&resultRecordCount=100';

let map;
let leafletMarkers  = {};
let boundaryLayer   = null;
let districtGeoJSON = null;
let boundariesOn    = false;
let activeFilter    = 'all';
let searchQuery     = '';
let openSchoolId    = null;
let compareList     = [];
let comparePanelOpen = false;
let activeSchools   = YL_SCHOOLS;

// ── INIT ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadSchoolData();
  plotSchools();
  wireControls();
  updateHeaderStats();
  updateReachCounter();
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
        id:                  Number(o.id),
        name:                o.name,
        shortName:           o.shortName || o.name,
        type:                o.type,
        status:              o.status,
        progress:            o.progress || (o.status === 'existing' ? 'active' : 'not_started'),
        notes:               o.notes || '',
        photoUrl:            o.photoUrl || '',
        staffPerson:         o.staffPerson || '',
        lat:                 Number(o.lat),
        lng:                 Number(o.lng),
        district:            o.district,
        grades:              o.grades,
        address:             o.address,
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

// ── MAP INIT ──────────────────────────────────────────────────────────────

function initMap() {
  map = L.map('map', {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    zoomControl: false,
    attributionControl: true
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

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
  if (school.type === 'Capernaum') {
    return L.divIcon({
      className: '',
      html: `<div class="mk-capernaum${sel}"><div class="pin"><span class="txt">C</span></div></div>`,
      iconSize:   [34, 42],
      iconAnchor: [17, 42],
      popupAnchor:[0, -44]
    });
  }
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
  const statusText = school.status === 'existing' ? '✓ Active YL' : '◎ Target School';
  const enrollText = school.enrollment ? `${school.enrollment.toLocaleString()} students` : '';
  const progressLabel = progressText(school);

  el.innerHTML = `
    <div class="t-name">${school.shortName}</div>
    <div class="t-sub">${statusText}${progressLabel ? ' · ' + progressLabel : ''}</div>
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

function progressText(school) {
  if (school.status === 'existing') return '';
  const map = {
    not_started:      '',
    exploring:        'Exploring',
    leader_identified:'Leader Identified',
    club_launched:    'Club Launched'
  };
  return map[school.progress] || '';
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────

function openSidebar(school) {
  const prev = openSchoolId;
  openSchoolId = school.id;

  if (prev && prev !== school.id) {
    const prevSchool = activeSchools.find(s => s.id === prev);
    if (prevSchool) refreshMarkerIcon(prevSchool);
  }
  refreshMarkerIcon(school);

  document.getElementById('sidebarContent').innerHTML = buildSidebarHTML(school);
  document.getElementById('sidebar').classList.add('open');

  document.getElementById('addCmpBtn').addEventListener('click', () => toggleCompare(school));
  document.getElementById('printBtn').addEventListener('click', () => window.print());

  const staffBadge = document.querySelector('.sc-staff');
  if (staffBadge) staffBadge.addEventListener('click', e => {
    e.stopPropagation();
    openStaffCard(school.staffPerson, staffBadge);
  });
}

function closeSidebar() {
  if (!openSchoolId) return;
  const prev = activeSchools.find(s => s.id === openSchoolId);
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

  const typeBadge = (() => {
    if (sc.type === 'Capernaum') return `<span class="badge b-capernaum">Capernaum</span>`;
    if (sc.type === 'HS')        return `<span class="badge b-hs">Young Life</span>`;
    if (sc.type === 'MS')        return `<span class="badge b-ms">Wyldlife</span>`;
    if (sc.type === 'College')   return `<span class="badge b-college">College YL</span>`;
    if (sc.type === 'YLOne')     return `<span class="badge b-ylone">YL One</span>`;
    return `<span class="badge b-special">Special Program</span>`;
  })();

  const statusBadge = sc.type === 'Capernaum'
    ? `<span class="badge b-capernaum">✓ Active Ministry</span>`
    : sc.status === 'existing'
      ? `<span class="badge b-existing">✓ Active YL</span>`
      : `<span class="badge b-target">◎ Target School</span>`;

  const gradesBadge = sc.grades && sc.grades !== 'College'
    ? `<span class="badge b-hs" style="background:#f1f5f9;color:#475569">Grades ${sc.grades}</span>`
    : '';

  const enrollVal = sc.enrollment ? sc.enrollment.toLocaleString() : '—';
  const frpmVal   = sc.frpm   !== null ? `${sc.frpm}%`   : '—';
  const elaVal    = sc.testScores.ela  !== null ? `${sc.testScores.ela}%`  : '—';
  const mathVal   = sc.testScores.math !== null ? `${sc.testScores.math}%` : '—';

  const frpmColor = colorFRPM(sc.frpm);
  const elaColor  = colorScore(sc.testScores.ela);
  const mathColor = colorScore(sc.testScores.math);

  return `
    ${photoSection(sc)}

    <div class="sc-header">
      <div class="sc-badges">${typeBadge}${statusBadge}${gradesBadge}</div>
      <div class="sc-name">${sc.name}</div>
      <div class="sc-district">${sc.district}</div>
      ${sc.staffPerson ? `<div class="sc-staff"><svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg> ${sc.staffPerson}</div>` : ''}
    </div>

    ${sc.status === 'target' ? readinessStepper(sc) : ''}
    ${sc.notes ? notesSection(sc.notes) : ''}

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
      Data: CA Dept. of Education SARC 2023–24 · CAASPP 2023–24 · EdData.org · Figures are approximate and for planning purposes.
    </div>
  `;
}

function photoSection(sc) {
  const initials = sc.shortName.split(' ').map(w => w[0]).join('').slice(0, 3);
  if (sc.photoUrl) {
    return `<div class="sc-photo" style="background-image:url('${sc.photoUrl}')"></div>`;
  }
  return `<div class="sc-photo sc-photo-placeholder"><span>${initials}</span></div>`;
}

function readinessStepper(sc) {
  const prog = sc.progress || 'not_started';
  const stepOrder = ['exploring', 'leader_identified', 'club_launched'];
  const currentIdx = stepOrder.indexOf(prog);

  const steps = PROGRESS_STEPS.map((step, i) => {
    const done   = i < currentIdx;
    const active = i === currentIdx;
    const cls    = done ? 'done' : active ? 'active' : 'pending';
    return `<div class="rs-step ${cls}">
      <div class="rs-dot"></div>
      <span>${step.label}</span>
    </div>${i < PROGRESS_STEPS.length - 1 ? '<div class="rs-line' + (done ? ' done' : '') + '"></div>' : ''}`;
  }).join('');

  const label = prog === 'not_started'
    ? 'No active steps yet — this school is on our radar.'
    : `Currently: <strong>${PROGRESS_STEPS.find(s => s.key === prog)?.label || prog}</strong>`;

  return `<div class="readiness-wrap">
    <div class="readiness-label">Ministry Progress</div>
    ${prog !== 'not_started' ? `<div class="rs-track">${steps}</div>` : ''}
    <div class="readiness-sublabel">${label}</div>
  </div>`;
}

function notesSection(notes) {
  return `<div class="notes-callout">
    <div class="notes-icon">
      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/></svg>
    </div>
    <p>${notes}</p>
  </div>`;
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
    <div class="sec-title">School Context</div>
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
  if (sc.address)                rows.push(['Address', sc.address]);
  if (sc.attendance)             rows.push(['Attendance Rate', `${sc.attendance}%`]);
  if (sc.englishLearners != null) rows.push(['English Learners', `${sc.englishLearners}%`]);
  if (sc.specialEd != null)      rows.push(['Special Education', `${sc.specialEd}%`]);

  return `<div class="section">
    <div class="sec-title">School Details</div>
    ${rows.map(([k, v]) => `
      <div class="info-row">
        <span class="info-k">${k}</span>
        <span class="info-v">${v}</span>
      </div>`).join('')}
  </div>`;
}

// ── STAFF CARD ────────────────────────────────────────────────────────────

function openStaffCard(name, anchorEl) {
  const staff = YL_STAFF && YL_STAFF[name];
  if (!staff) return;

  const card = document.getElementById('staffCard');
  document.getElementById('staffPhoto').src    = staff.photoFile;
  document.getElementById('staffPhoto').alt    = staff.name;
  document.getElementById('staffName').textContent  = staff.name;
  document.getElementById('staffTitle').textContent = `${staff.title} · ${staff.org}`;

  const phoneFormatted = staff.phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  document.getElementById('staffPhoneText').textContent = phoneFormatted;
  document.getElementById('staffPhone').href = `tel:${staff.phone}`;
  document.getElementById('staffEmailText').textContent = staff.email;
  document.getElementById('staffEmail').href = `mailto:${staff.email}`;

  // Position near the anchor element
  const rect = anchorEl.getBoundingClientRect();
  card.style.top  = `${rect.bottom + 8}px`;
  card.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;

  card.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('staffCardClose').addEventListener('click', () => {
    document.getElementById('staffCard').classList.add('hidden');
  });
  document.addEventListener('click', e => {
    const card = document.getElementById('staffCard');
    if (!card.classList.contains('hidden') && !card.contains(e.target) && !e.target.closest('.sc-staff')) {
      card.classList.add('hidden');
    }
  });
});

// ── REACH COUNTER ─────────────────────────────────────────────────────────

function updateReachCounter() {
  const existing = activeSchools.filter(s => s.status === 'existing');
  const targets  = activeSchools.filter(s => s.status === 'target');

  const existingStudents = existing.reduce((sum, s) => sum + (s.enrollment || 0), 0);
  const targetStudents   = targets.reduce((sum, s)  => sum + (s.enrollment || 0), 0);

  document.getElementById('reachExistingCount').textContent    = existing.length;
  document.getElementById('reachExistingStudents').textContent = existingStudents.toLocaleString();
  document.getElementById('reachTargetCount').textContent      = targets.length;
  document.getElementById('reachTargetStudents').textContent   = targetStudents.toLocaleString();
}

// ── SEARCH ────────────────────────────────────────────────────────────────

function applySearch(query) {
  searchQuery = query.toLowerCase().trim();
  const clearBtn = document.getElementById('searchClear');
  clearBtn.style.display = searchQuery ? 'flex' : 'none';
  applyFilter();

  if (searchQuery) {
    const match = activeSchools.find(s =>
      s.name.toLowerCase().includes(searchQuery) ||
      s.shortName.toLowerCase().includes(searchQuery) ||
      s.district.toLowerCase().includes(searchQuery)
    );
    if (match) map.setView([match.lat, match.lng], 14);
  }
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
  btn.textContent = n >= 2 ? `Compare ${n}` : n === 1 ? 'Compare 1' : 'Compare';
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
    const progressBadge = sc.status === 'target' && sc.progress && sc.progress !== 'not_started'
      ? `<div style="font-size:10px;color:#d97706;margin-bottom:8px">◉ ${progressText(sc)}</div>`
      : '';

    return `
      <div class="cmp-card">
        <div class="cmp-card-name">${sc.shortName}</div>
        <div class="cmp-card-dist">${sc.district}</div>
        ${sc.staffPerson ? `<div class="cmp-card-staff">${sc.staffPerson}</div>` : ''}
        <span class="badge ${sc.status === 'existing' ? 'b-existing' : 'b-target'}" style="font-size:9px;margin-bottom:6px;display:inline-block">
          ${sc.status === 'existing' ? 'Active YL' : 'Target'}
        </span>
        ${progressBadge}
        <div class="cmp-row"><span class="cmp-k">Enrollment</span>
          <span class="cmp-v${cls('enrollment', sc.enrollment)}">${sc.enrollment ? sc.enrollment.toLocaleString() : '—'}</span></div>
        <div class="cmp-row"><span class="cmp-k">Free Lunch %</span>
          <span class="cmp-v${cls('frpm', sc.frpm)}">${sc.frpm !== null ? sc.frpm + '%' : '—'}</span></div>
        <div class="cmp-row"><span class="cmp-k">ELA Proficiency</span>
          <span class="cmp-v${cls('ela', ela)}">${ela !== null ? ela + '%' : '—'}</span></div>
        <div class="cmp-row"><span class="cmp-k">Math Proficiency</span>
          <span class="cmp-v${cls('math', math)}">${math !== null ? math + '%' : '—'}</span></div>
        <div class="cmp-row"><span class="cmp-k">Graduation Rate</span>
          <span class="cmp-v${cls('graduationRate', sc.graduationRate)}">${sc.graduationRate != null ? sc.graduationRate + '%' : '—'}</span></div>
        <div class="cmp-row"><span class="cmp-k">Chronic Absent.</span>
          <span class="cmp-v${cls('chronicAbsenteeism', sc.chronicAbsenteeism)}">${sc.chronicAbsenteeism != null ? sc.chronicAbsenteeism + '%' : '—'}</span></div>
        <div class="cmp-row"><span class="cmp-k">Median Income</span>
          <span class="cmp-v${cls('medianIncome', sc.medianIncome)}">${sc.medianIncome ? '$' + sc.medianIncome.toLocaleString() : '—'}</span></div>
        <div class="cmp-row"><span class="cmp-k">Attendance</span>
          <span class="cmp-v">${sc.attendance ? sc.attendance + '%' : '—'}</span></div>
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

    const matchesFilter = activeFilter === 'all'
      || (activeFilter === 'younglife'  && sc.type === 'HS')
      || (activeFilter === 'wyldlife'   && sc.type === 'MS')
      || (activeFilter === 'college'    && sc.type === 'College')
      || (activeFilter === 'ylone'      && sc.type === 'YLOne')
      || (activeFilter === 'capernaum'  && sc.type === 'Capernaum');

    const matchesSearch = !searchQuery
      || sc.name.toLowerCase().includes(searchQuery)
      || sc.shortName.toLowerCase().includes(searchQuery)
      || sc.district.toLowerCase().includes(searchQuery);

    const show = matchesFilter && matchesSearch;
    if (show && !map.hasLayer(marker)) marker.addTo(map);
    if (!show && map.hasLayer(marker)) map.removeLayer(marker);
  });
}

// ── CONTROLS WIRING ───────────────────────────────────────────────────────

function wireControls() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilter();
    });
  });

  document.getElementById('boundaryBtn').addEventListener('click', toggleBoundaries);
  document.getElementById('compareBtn').addEventListener('click', toggleComparePanel);

  document.getElementById('cmpCloseBtn').addEventListener('click', () => {
    comparePanelOpen = false;
    document.getElementById('comparePanel').classList.remove('open');
  });

  document.getElementById('cmpClearBtn').addEventListener('click', () => {
    compareList = [];
    updateCompareCounter();
    renderComparePanel();
    if (openSchoolId) updateCompareBtnState(openSchoolId);
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', e => applySearch(e.target.value));
  searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { searchInput.value = ''; applySearch(''); } });

  document.getElementById('searchClear').addEventListener('click', () => {
    searchInput.value = '';
    applySearch('');
    searchInput.focus();
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
}

// ── SCHOOL BOUNDARY ZONES ─────────────────────────────────────────────────

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

  const existingDistricts = new Set(
    activeSchools.filter(s => s.status === 'existing').map(s => s.district)
  );

  function districtHasExisting(apiName) {
    return [...existingDistricts].some(d => d.includes(apiName) || apiName.includes(d.split(' ')[0]));
  }

  function districtSummary(apiName) {
    const schools = activeSchools.filter(s =>
      s.district.toLowerCase().includes(apiName.toLowerCase().split(' ')[0].toLowerCase())
    );
    const active  = schools.filter(s => s.status === 'existing');
    const targets = schools.filter(s => s.status === 'target');
    const totalEnroll = active.reduce((sum, s) => sum + (s.enrollment || 0), 0);
    return { schools, active, targets, totalEnroll };
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

      layer.on('click', e => {
        L.DomEvent.stopPropagation(e);
        const { active, targets, totalEnroll } = districtSummary(name);

        const activeList  = active.map(s => `<li>✓ ${s.shortName}</li>`).join('');
        const targetList  = targets.map(s => {
          const prog = progressText(s);
          return `<li>◎ ${s.shortName}${prog ? ' <em>(' + prog + ')</em>' : ''}</li>`;
        }).join('');

        L.popup({ maxWidth: 280 })
          .setLatLng(e.latlng)
          .setContent(`
            <div class="district-popup">
              <div class="dp-title">${name}</div>
              ${active.length ? `<div class="dp-section"><strong>Active YL (${active.length})</strong><ul>${activeList}</ul>${totalEnroll ? `<div class="dp-reach">${totalEnroll.toLocaleString()} students reached</div>` : ''}</div>` : ''}
              ${targets.length ? `<div class="dp-section"><strong>Target Schools (${targets.length})</strong><ul>${targetList}</ul></div>` : ''}
              ${!active.length && !targets.length ? '<div class="dp-section" style="color:#9ca3af">No YL schools in this district yet.</div>' : ''}
            </div>
          `)
          .openOn(map);
      });
    }
  }).addTo(map);

  btn.textContent = 'School Zones';
}
