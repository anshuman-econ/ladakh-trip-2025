const CSV_PATH = 'data/budget.csv';

// Minimal CSV parser (simple: no embedded commas/quotes)
function parseCSV(text){
  const rows = text.trim().split(/\r?\n/).map(r=>r.split(','));
  const header = rows.shift().map(h=>h.trim());
  return rows.map(r => Object.fromEntries(r.map((v,i)=>[header[i], v.trim()])));
}

async function loadBudget(){
  const txt = await fetch(CSV_PATH).then(r=>r.text());
  return parseCSV(txt);
}

function renderBudget(rows){
  // Totals by currency
  const byCurrency = {};
  rows.forEach(r=>{
    const cur = r.currency || 'INR';
    const val = parseFloat(r.amount) || 0;
    byCurrency[cur] = (byCurrency[cur]||0) + val;
  });
  const totals = Object.entries(byCurrency)
    .map(([c,v])=>`${c} ${v.toLocaleString('en-IN')}`)
    .join('  •  ');
  document.getElementById('budgetTotals').textContent = totals;

  // Table
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

(async function boot(){
  try{
    const rows = await loadBudget();
    renderBudget(rows);
  }catch(err){
    console.error(err);
    document.getElementById('budgetTotals').textContent = 'Failed to load data/budget.csv';
  }
})();
