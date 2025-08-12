// --- Static site config (no APIs) ---
const files = {
  stays:  'data/stays.json',
  pois:   'data/pois.json',
  images: 'data/images.json'
};

const state = {
  stays: [],
  pois: {},     // key -> [{name,lat,lng,gmaps}]
  images: {},   // key -> [{src,title,credit,page}]
  selected: 0,
  maps: { main: null },
  markers: [],
  routeLine: null,
  dists: []     // distance from previous stop (km), index-aligned with stays
};

const fmtTime = (d) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata'
  }).format(d);

const shortName = (s) => s.replace(/\s*\(.*?\)\s*/g, '').trim();

// Haversine (km)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadAll() {
  const [stays, pois, images] = await Promise.all([
    fetch(files.stays).then(r => r.json()),
    fetch(files.pois).then(r => r.json()),
    fetch(files.images).then(r => r.json())
  ]);
  state.stays = stays;
  state.pois = pois;
  state.images = images;

  // Precompute distances from previous stop
  state.dists = new Array(stays.length).fill(null);
  for (let i = 1; i < stays.length; i++) {
    state.dists[i] = +haversine(
      stays[i - 1].lat, stays[i - 1].lng,
      stays[i].lat, stays[i].lng
    ).toFixed(1);
  }
}

function initMainMap() {
  const m = L.map('map', { zoomControl: true });
  state.maps.main = m;

  const terrain   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenTopoMap, OSM' });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' });
  const light     = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OSM' });

  // Default = Light streets
  light.addTo(m);
  L.control.layers({ 'Light': light, 'Terrain': terrain, 'Satellite': satellite }).addTo(m);

  const latlngs = [];
  state.stays.forEach((s, i) => {
    const latlng = [s.lat, s.lng];
    latlngs.push(latlng);

    const marker = L.marker(latlng)
      .addTo(m)
      .bindPopup(`<b>${i + 1}. ${s.name}</b><br>${s.check_in} → ${s.check_out}`)
      .on('click', () => selectStay(i));
    state.markers.push(marker);

    L.marker(latlng, {
      interactive: false,
      icon: L.divIcon({ className: 'ordlbl', html: `${i + 1}`, iconSize: [24, 24], iconAnchor: [12, 30] })
    }).addTo(m);
  });

  if (latlngs.length > 1) {
    state.routeLine = L.polyline(latlngs, { color: '#6bb6ff', weight: 3, opacity: 0.9 }).addTo(m);
  }
  m.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] });

  // Route toggle
  const rt = document.getElementById('routeToggle');
  if (rt) {
    rt.addEventListener('change', (e) => {
      if (!state.routeLine) return;
      if (e.target.checked) { state.routeLine.addTo(m); }
      else { m.removeLayer(state.routeLine); }
    });
  }
}

function renderStayLinks() {
  const box = document.getElementById('stayList');
  box.innerHTML = '';
  state.stays.forEach((s, i) => {
    const a = document.createElement('a');
    a.href = '#';
    const inStr  = new Date(s.check_in).toLocaleDateString('en-GB', { month: 'short', day: '2-digit' });
    const outStr = new Date(s.check_out).toLocaleDateString('en-GB', { month: 'short', day: '2-digit' });
    const distStr = (i > 0 && state.dists[i] != null) ? ` (${state.dists[i]} km)` : '';
    a.textContent = `${i + 1}. ${s.name} (${inStr} → ${outStr})${distStr}`;
    a.className = 'stay-link' + (state.selected === i ? ' active' : '');
    a.addEventListener('click', (e) => { e.preventDefault(); selectStay(i); });
    box.appendChild(a);
  });
}

function selectStay(i) {
  state.selected = i;
  renderStayLinks();

  const s = state.stays[i];
  state.maps.main.panTo([s.lat, s.lng]);

  // Explore meta
  document.getElementById('exploreTitle').textContent = `Explore — ${s.name}`;
  document.getElementById('areaMeta').textContent = `${s.check_in} → ${s.check_out}`;

  // POIs (link to Google Maps)
  const list = document.getElementById('poiList'); list.innerHTML = '';
  (state.pois[s.key] || []).forEach(p => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = p.gmaps; a.target = '_blank'; a.rel = 'noopener'; a.textContent = p.name;
    li.appendChild(a);
    list.appendChild(li);
  });

  // Golden hour for check-in date
  const d = new Date(`${s.check_in}T12:00:00+05:30`);
  const t = SunCalc.getTimes(d, s.lat, s.lng);
  const lines = [
    `Sunrise: ${fmtTime(t.sunrise)} · Golden (AM) ends: ${fmtTime(t.goldenHourEnd)}`,
    `Sunset: ${fmtTime(t.sunset)} · Golden (PM) starts: ${fmtTime(t.goldenHour)}`
  ];
  const lightBox = document.getElementById('lightBox');
  lightBox.innerHTML = lines.join('<br>');

  // Live weather link (external)
  const windyUrl = `https://www.windy.com/?${s.lat},${s.lng},10`;
  const linkHtml = `<div class="meta" style="margin-top:.35rem">
      <a href="${windyUrl}" target="_blank" rel="noopener">Open live weather for this spot ↗</a>
    </div>`;
  lightBox.insertAdjacentHTML('beforeend', linkHtml);

  // Gallery
  const gal = document.getElementById('gallery'); gal.innerHTML = '';
  (state.images[s.key] || []).forEach(img => {
    const el = document.createElement('a');
    el.href = img.page || img.src; el.target = '_blank'; el.rel = 'noopener';
    const im = document.createElement('img');
    im.loading = 'lazy'; im.src = img.src; im.alt = img.title || '';
    el.title = (img.title ? img.title + ' · ' : '') + (img.credit || '');
    el.appendChild(im);
    gal.appendChild(el);
  });
}

(async function boot() {
  try {
    await loadAll();
    initMainMap();
    renderStayLinks();
    selectStay(0); // default
  } catch (err) {
    console.error(err);
    // Fallback message if something fails early
    const el = document.getElementById('exploreTitle');
    if (el) el.textContent = 'Error loading site data.';
  }
})();
