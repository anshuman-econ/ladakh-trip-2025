// --- Config (no APIs) ---
const files = {
  stays:  'data/stays.json',
  pois:   'data/pois.json',
  images: 'data/images.json',
  budget: 'data/budget.csv'
};

const state = {
  stays: [],
  pois: {},         // keyed by stay.key
  images: {},       // keyed by stay.key
  selected: null,
  maps: { main: null, area: null },
  markers: []
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

// Minimal CSV parser (no embedded commas/quotes)
function parseCSV(text){
  const rows = text.trim().split(/\r?\n/).map(r=>r.split(','));
  const header = rows.shift().map(h=>h.trim());
  return rows.map(r => Object.fromEntries(r.map((v,i)=>[header[i], v.trim()])));
}

async function loadAll(){
  const [stays, pois, images, budgetTxt] = await Promise.all([
    fetch(files.stays).then(r=>r.json()),
    fetch(files.pois).then(r=>r.json()),
    fetch(files.images).then(r=>r.json()),
    fetch(files.budget).then(r=>r.text()).catch(_=>'')
  ]);
  state.stays = stays;
  state.pois = pois;
  state.images = images;
  state.budget = budgetTxt ? parseCSV(budgetTxt) : [];
}

function initMainMap(){
  const m = L.map('map', { zoomControl:true });
  state.maps.main = m;

  const terrain   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution:'&copy; OpenTopoMap, OSM' });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution:'&copy; Esri' });
  const light     = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution:'&copy; OSM' });

  terrain.addTo(m);
  L.control.layers({ 'Terrain':terrain, 'Satellite':satellite, 'Light':light }).addTo(m);

  // Markers & route
  const latlngs = [];
  state.stays.forEach((s,i)=>{
    const latlng = [s.lat, s.lng];
    latlngs.push(latlng);

    // main marker
    const marker = L.marker(latlng).addTo(m).bindPopup(
      `<b>${i+1}. ${s.name}</b><br>${s.check_in} → ${s.check_out}`
    ).on('click', ()=>selectStay(i));
    state.markers.push(marker);

    // number badge as label
    const badge = L.marker(latlng, {
      interactive:false,
      icon: L.divIcon({ className:'ordlbl', html: `${i+1}`, iconSize:[24,24], iconAnchor:[12,30] })
    }).addTo(m);
  });

  // route line
  if(latlngs.length>1) L.polyline(latlngs, { color:'#6bb6ff', weight:3, opacity:0.9 }).addTo(m);
  m.fitBounds(L.latLngBounds(latlngs), { padding:[20,20] });

  // chained distances
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
}

function renderStayLinks(){
  const box = document.getElementById('stayList');
  box.innerHTML = '';
  state.stays.forEach((s,i)=>{
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = `${i+1}. ${s.name} (${new Date(s.check_in).toLocaleDateString('en-GB', {month:'short', day:'2-digit'})} → ${new Date(s.check_out).toLocaleDateString('en-GB', {month:'short', day:'2-digit'})})`;
    a.className = 'stay-link' + (state.selected===i ? ' active':'');
    a.addEventListener('click', (e)=>{ e.preventDefault(); selectStay(i); });
    box.appendChild(a);
  });
}

function initAreaMap(){
  state.maps.area = L.map('areaMap', { zoomControl:true });
  const terrain   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution:'&copy; OpenTopoMap, OSM' });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution:'&copy; Esri' });
  const light     = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution:'&copy; OSM' });
  terrain.addTo(state.maps.area);
  L.control.layers({ 'Terrain':terrain, 'Satellite':satellite, 'Light':light }).addTo(state.maps.area);
}

function selectStay(i){
  state.selected = i;
  renderStayLinks();
  const s = state.stays[i];
  // pan main map
  state.maps.main.panTo([s.lat,s.lng]);

  // update Explore
  document.getElementById('exploreTitle').textContent = `Explore — ${s.name}`;
  document.getElementById('areaMeta').textContent = `${s.check_in} → ${s.check_out}`;
  const am = state.maps.area;
  am.setView([s.lat,s.lng], 11);
  L.marker([s.lat,s.lng]).addTo(am).bindPopup(s.name).openPopup();

  // POIs (hardcoded, link to Google Maps)
  const list = document.getElementById('poiList'); list.innerHTML='';
  const pois = (state.pois[s.key] || []);
  pois.forEach(p=>{
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = p.gmaps; a.target = '_blank'; a.rel='noopener'; a.textContent = p.name;
    li.appendChild(a);
    list.appendChild(li);
  });

  // Golden / blue hour for check-in date
  const d = new Date(`${s.check_in}T12:00:00+05:30`);
  const t = SunCalc.getTimes(d, s.lat, s.lng);
  const lines = [
    `Sunrise: ${fmtTime(t.sunrise)} · Golden (AM) ends: ${fmtTime(t.goldenHourEnd)}`,
    `Sunset: ${fmtTime(t.sunset)} · Golden (PM) starts: ${fmtTime(t.goldenHour)}`
  ];
  document.getElementById('lightBox').innerHTML = lines.join('<br>');

  // Gallery (embedded URLs from images.json)
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

function renderBudget(){
  const rows = state.budget || [];
  const byCurrency = {};
  rows.forEach(r=>{
    const cur = r.currency || 'INR';
    byCurrency[cur] = (byCurrency[cur]||0) + (parseFloat(r.amount)||0);
  });
  const totals = Object.entries(byCurrency).map(([c,v])=>`${c} ${v.toLocaleString('en-IN')}`).join('  •  ');
  document.getElementById('budgetTotals').textContent = `Total: ${totals}`;

  const tbl = document.getElementById('budgetTable');
  tbl.innerHTML = '';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>Date</th><th>Category</th><th>Description</th><th class="amt">Amount</th><th>Cur</th></tr>`;
  tbl.appendChild(thead);
  const tb = document.createElement('tbody');
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date||''}</td><td>${r.category||''}</td><td>${r.description||''}</td><td class="amt">${r.amount||''}</td><td>${r.currency||''}</td>`;
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
}

async function boot(){
  await loadAll();
  initMainMap();
  initAreaMap();
  renderStayLinks();
  renderBudget();
  // select first stay by default
  selectStay(0);
}

boot().catch(err=>{
  console.error(err);
  document.getElementById('routeChain').textContent = 'Error loading site data. Open console for details.';
});
