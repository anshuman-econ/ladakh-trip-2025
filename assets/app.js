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
  routeLine: null
};

const fmtTime = (d) => new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(d);
const shortName = (s) => s.replace(/\s*\(.*?\)\s*/g,'').trim();

// Haversine (km)
function haversine(lat1, lon1, lat2, lon2){
  const R=6371, toRad = x => x*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function loadAll(){
  const [stays, pois, images] = await Promise.all([
    fetch(files.stays).then(r=>r.json()),
    fetch(files.pois).then(r=>r.json()),
    fetch(files.images).then(r=>r.json())
  ]);
  state.stays = stays;
  state.pois = pois;
  state.images = images;
}

function initMainMap(){
  const m = L.map('map', { zoomControl:true });
  state.maps.main = m;

  const terrain   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution:'&copy; OpenTopoMap, OSM' });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution:'&copy; Esri' });
  const light     = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution:'&copy; OSM' });

  terrain.addTo(m);
  L.control.layers({ 'Terrain':terrain, 'Satellite':satellite, 'Light':light }).addTo(m);

  // Markers + number badges + route
  const latlngs = [];
  state.stays.forEach((s,i)=>{
    const latlng = [s.lat, s.lng];
    latlngs.push(latlng);

    const marker = L.marker(latlng).addTo(m).bindPopup(
      `<b>${i+1}. ${s.name}</b><br>${s.check_in} → ${s.check_out}`
    ).on('click', ()=>selectStay(i));
    state.markers.push(marker);

    L.marker(latlng, {
      interactive:false,
      icon: L.divIcon({ className:'ordlbl', html: `${i+1}`, iconSize:[24,24], iconAnchor:[12,30] })
    }).addTo(m);
  });

  if(latlngs.length>1){
    state.routeLine = L.polyline(latlngs, { color:'#6bb6ff', weight:3, opacity:0.9 }).addTo(m);
  }
  m.fitBounds(L.latLngBounds(latlngs), { padding:[20,20] });

  // chained distances, e.g. "1.A → 2.B: 55.7 km → 3.C: …"
  const parts = [];
  for(let i=0;i<state.stays.length-1;i++){
    const A = state.stays[i], B = state.stays[i+1];
    const d = haversine(A.lat,A.lng,B.lat,B.lng).toFixed(1);
    if(i===0){
      parts.push(`${i+1}.${shortName(A.name)} → ${i+2}.${shortName(B.name)}: ${d} km`);
    }else{
      parts.push(`→ ${i+2}.${shortName(B.name)}: ${d} km`);
    }
  }
  document.getElementById('routeChain').textContent = parts.join(' ');

  // route toggle
  document.getElementById('routeToggle').addEventListener('change', (e)=>{
    if(!state.routeLine) return;
    const show = e.target.checked;
    if(show){ state.routeLine.addTo(m); } else { m.removeLayer(state.routeLine); }
  });
}

function renderStayLinks(){
  const box = document.getElementById('stayList');
  box.innerHTML = '';
  state.stays.forEach((s,i)=>{
    const a = document.createElement('a');
    a.href = '#';
    const inStr  = new Date(s.check_in).toLocaleDateString('en-GB', {month:'short', day:'2-digit'});
    const outStr = new Date(s.check_out).toLocaleDateString('en-GB', {month:'short', day:'2-digit'});
    a.textContent = `${i+1}. ${s.name} (${inStr} → ${outStr})`;
    a.className = 'stay-link' + (state.selected===i ? ' active':'');
    a.addEventListener('click', (e)=>{ e.preventDefault(); selectStay(i); });
    box.appendChild(a);
  });
}

function selectStay(i){
  state.selected = i;
  renderStayLinks();

  const s = state.stays[i];
  state.maps.main.panTo([s.lat,s.lng]);

  // Explore meta
  document.getElementById('exploreTitle').textContent = `Explore — ${s.name}`;
  document.getElementById('areaMeta').textContent = `${s.check_in} → ${s.check_out}`;

  // POIs (hard-coded, open in Google Maps)
  const list = document.getElementById('poiList'); list.innerHTML='';
  const pois = (state.pois[s.key] || []);
  pois.forEach(p=>{
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = p.gmaps; a.target = '_blank'; a.rel='noopener'; a.textContent = p.name;
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
  document.getElementById('lightBox').innerHTML = lines.join('<br>');

  // Gallery (from images.json) — shown in the full-width section
  const gal = document.getElementById('gallery'); gal.innerHTML='';
  (state.images[s.key] || []).forEach(img=>{
    const el = document.createElement('a');
    el.href = img.page || img.src; el.target = '_blank'; el.rel='noopener';
    const im = document.createElement('img');
    im.loading = 'lazy'; im.src = img.src; im.alt = img.title || '';
    el.title = (img.title ? img.title+' · ' : '') + (img.credit || '');
    el.appendChild(im);
    gal.appendChild(el);
  });
}

async function boot(){
  await loadAll();
  initMainMap();
  renderStayLinks();
  selectStay(0); // default
}

boot().catch(err=>{
  console.error(err);
  document.getElementById('routeChain').textContent = 'Error loading site data. Open console for details.';
});
