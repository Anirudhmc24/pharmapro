// inventory.js — Inventory page + drug edit + expiry return
import { GET, POST, PUT } from './api.js';
import { fmt, fmtI, tag, expiryTag, expiryColor, fmtExp, monthsLeft, breakdown, toast, modal, closeModal } from './utils.js';

export async function renderInventory(c, APP) {
  let drugs   = await GET('/inventory');
  let filter  = '';

  function filteredDrugs() {
    if (!filter) return drugs;
    const q = filter.toLowerCase();
    return drugs.filter(d => (d.name + d.brand + d.category + d.rack).toLowerCase().includes(q));
  }

  function html() {
    const list = filteredDrugs();
    return `<div class="gap-16 fade-in">
      <div class="flex-between">
        <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Inventory</h2>
          <div style="color:var(--muted);font-size:12px">${drugs.length} drugs · Tablet-level tracking</div></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="showExpiringManager()">Return Expiring Stock</button>
          <button class="btn btn-primary btn-sm" onclick="showAddDrug()">+ Add Drug</button>
        </div>
      </div>
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input class="input" id="inv-filter" placeholder="Filter by name, brand, category, rack…" value="${filter}" oninput="invFilter(this.value)">
      </div>
      <div class="card" style="padding:0;overflow:auto">
        <table class="tbl" id="inv-table">
          <thead><tr><th>Drug / Brand</th><th>Category</th><th>Location</th><th>Stock</th><th>Nearest Expiry</th><th>MRP/tab</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${list.map(d => invRow(d)).join('')}</tbody>
        </table>
        ${list.length === 0 ? '<div style="padding:40px;text-align:center;color:var(--muted)">No drugs found</div>' : ''}
      </div>
    </div>`;
  }

  function invRow(d) {
    const { full, broken, tps } = breakdown(d);
    const low = (d.stock_tablets || 0) < (d.reorder_level || 20);
    const exp = d.nearest_expiry;
    const ml  = monthsLeft(exp);
    return `<tr>
      <td><div style="font-weight:700;color:var(--text)">${d.name}</div>
          <div style="font-size:11px;color:var(--muted)">${d.brand || ''}</div></td>
      <td style="font-size:12px;color:var(--muted)">${d.category || '—'}</td>
      <td style="font-size:12px"><button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:10px" onclick="locateDrug(${d.id})">📍 Locate</button></td>
      <td><div style="font-weight:800;color:${low ? 'var(--danger)' : 'var(--accent)'};font-size:15px">${d.stock_tablets || 0}</div>
          <div style="font-size:10px;color:var(--muted)">${full} ${(d.pack_type || 'Strip').toLowerCase()}s${broken > 0 ? '+' + broken + ' loose' : ''}</div></td>
      <td style="color:${expiryColor(exp)};font-size:12px;font-weight:${ml <= 3 ? 700 : 400}">${fmtExp(exp) || '—'}</td>
      <td style="font-weight:700">${fmt(d.mrp_per_tablet || 0)} <span style="font-size:9px;color:var(--muted)">/item</span></td>
      <td>${low ? tag('Low Stock', 'tag-red') : ml <= 0 ? tag('Expired', 'tag-red') : ml <= 3 ? tag('Exp Soon', 'tag-amber') : tag('OK', 'tag-green')}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="showEditDrug(${d.id})">✏️ Edit</button>
        ${d.nearest_expiry && ml <= 6 ? `<button class="btn btn-outline btn-sm" style="margin-top:4px;color:var(--warn);border-color:var(--warn)44" onclick="showExpiryReturn(${d.id},'${d.name}')">↩ Return</button>` : ''}
      </td>
    </tr>`;
  }

  c.innerHTML = html();

  window.locateDrug = async (id) => {
    try {
      const res = await GET('/drugs/' + id + '/locate');
      if (res.found) {
        modal('📍 Drug Location', `
          <div class="alert-strip info" style="font-size:16px;text-align:center;padding:24px;background:var(--surface)">
            <div><span style="font-size:32px">🗺️</span></div>
            <div style="font-weight:900;margin-top:12px;color:var(--accent)">${res.path}</div>
            <div style="color:var(--muted);font-size:12px;margin-top:6px">Map Coordinates: X: ${res.x}, Y: ${res.y}</div>
          </div>
        `, `<button class="btn btn-primary" style="width:100%" onclick="closeModal()">Got it</button>`);
      } else {
        toast('Location not set for this drug', 'warn');
      }
    } catch (e) {
      toast('Failed to locate drug: ' + e.message, 'error');
    }
  };

  window.invFilter = (v) => { filter = v; document.querySelector('#inv-table tbody').innerHTML = filteredDrugs().map(d => invRow(d)).join(''); };

  window.showAddDrug = () => {
    modal('➕ Add New Drug', `
      <div class="field" style="position:relative">
        <label>Search Master Database (250k+ Drugs)</label>
        <div class="search-wrap" style="margin-bottom:8px">
          <input class="input" id="ad-master-search" placeholder="Type 3+ letters to search (e.g. Augmentin)" oninput="searchMaster(this.value)">
          <button class="btn btn-outline btn-sm" style="position:absolute;right:8px;top:32px;padding:4px 8px;font-size:11px" onclick="searchCloudDirect()">🌐 Cloud Sync</button>
          <div id="ad-master-results" class="card" style="position:absolute;top:100%;left:0;right:0;z-index:999;display:none;max-height:200px;overflow-y:auto;box-shadow:var(--shadow-lg)"></div>
        </div>
      </div>
      <div id="cloud-status" style="font-size:11px;color:var(--muted);margin-bottom:8px"></div>
      <div class="grid-2">
        <div class="field"><label>Drug Name *</label><input class="input" id="ad-name" placeholder="Name"></div>
        <div class="field"><label>Brand / Manufacturer</label><input class="input" id="ad-brand" placeholder="Brand"></div>
      </div>
      <div class="field"><label>Composition</label><input class="input" id="ad-comp" placeholder="Composition"></div>
      <div class="grid-2">
        <div class="field"><label>Category</label><input class="input" id="ad-cat" placeholder="Category"></div>
        <div class="field"><label>HSN Code</label><input class="input" id="ad-hsn" value="30049099"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Packaging Type</label>
          <select class="select" id="ad-pack">
            <option value="Strip">Strip</option>
            <option value="Bottle">Bottle</option>
            <option value="Tube">Tube</option>
            <option value="Piece">Piece</option>
            <option value="Box">Box</option>
          </select>
        </div>
        <div class="field"><label>Items / Pack</label><input class="input" type="number" id="ad-tps" value="10"></div>
      </div>
        <div class="field"><label>MRP / Strip (₹)</label><input class="input" type="number" id="ad-mrps" value="0" step="0.5"></div>
      </div>
      <div class="field"><label>Schedule</label>
        <select class="select" id="ad-sched"><option value="OTC">OTC</option><option value="Rx">Rx</option><option value="H">H</option></select>
      </div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="saveDrug()">Add Drug</button>`
    );
  };

  window.searchCloudDirect = async () => {
    const q = document.getElementById('ad-master-search').value;
    if (q.length < 3) { toast('Type a medicine name first', 'warn'); return; }
    const status = document.getElementById('cloud-status');
    status.innerHTML = '⏳ Searching live on Cloud (1mg/Netmeds)...';
    
    const results = await GET('/cloud/search?q=' + encodeURIComponent(q));
    if (!results || !results.length) {
      status.innerHTML = '❌ Not found in live cloud. Use Master DB.';
      return;
    }
    
    status.innerHTML = `✅ Found ${results.length} cloud matches.`;
    const resDiv = document.getElementById('ad-master-results');
    resDiv.innerHTML = results.map(d => `
      <div class="list-item" style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);background:#f0f7ff" onclick='selectCloudDrug(${JSON.stringify(d).replace(/'/g, "&apos;")})'>
        <div style="display:flex;gap:10px;align-items:center">
          ${d.image_url ? `<img src="${d.image_url}" style="width:40px;height:40px;object-fit:contain;border-radius:4px">` : '💊'}
          <div style="flex:1">
            <div style="font-weight:800;font-size:13px;color:var(--accent)">${d.name}</div>
            <div style="font-size:10px;color:var(--muted)">${d.manufacturer} · Live MRP: ₹${d.mrp}</div>
          </div>
          <div style="font-size:18px">☁️</div>
        </div>
      </div>
    `).join('');
    resDiv.style.display = 'block';
  };

  window.selectCloudDrug = async (d) => {
    document.getElementById('ad-name').value = d.name;
    document.getElementById('ad-brand').value = d.manufacturer;
    document.getElementById('ad-mrps').value = d.mrp || 0;
    document.getElementById('ad-master-results').style.display = 'none';
    
    const status = document.getElementById('cloud-status');
    status.innerHTML = '⌛ Fetching composition and side effects...';
    
    try {
      const details = await GET('/cloud/details?url=' + encodeURIComponent(d.detail_url));
      document.getElementById('ad-comp').value = details.composition || '';
      status.innerHTML = '✅ Cloud Data Synced Successfully!';
      toast('Synced from Live Cloud!', 'success');
    } catch(e) {
      status.innerHTML = '⚠️ Basic details synced. Composition failed.';
    }
  };

  window.searchMaster = async (q) => {
    const resDiv = document.getElementById('ad-master-results');
    if (q.length < 3) { resDiv.style.display = 'none'; return; }
    const results = await GET('/drugs/master_search?q=' + encodeURIComponent(q));
    if (!results.length) { resDiv.style.display = 'none'; return; }
    
    resDiv.innerHTML = results.map(d => `
      <div class="list-item" style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border)" onclick='selectMasterDrug(${JSON.stringify(d).replace(/'/g, "&apos;")})'>
        <div style="font-weight:700;font-size:13px">${d.name}</div>
        <div style="font-size:10px;color:var(--muted)">${d.manufacturer} | ${d.composition.substring(0, 50)}...</div>
      </div>
    `).join('');
    resDiv.style.display = 'block';
  };

  window.selectMasterDrug = (d) => {
    document.getElementById('ad-name').value = d.name;
    document.getElementById('ad-brand').value = d.manufacturer;
    document.getElementById('ad-comp').value = d.composition;
    document.getElementById('ad-mrps').value = d.mrp || 0;
    document.getElementById('ad-master-results').style.display = 'none';
    document.getElementById('ad-master-search').value = d.name;
    toast('Auto-filled drug details!', 'info');
  };

  window.saveDrug = async () => {
    const name = document.getElementById('ad-name')?.value?.trim();
    if (!name) { toast('Drug name required', 'warn'); return; }
    const tps  = parseInt(document.getElementById('ad-tps')?.value || 10);
    const mrps = parseFloat(document.getElementById('ad-mrps')?.value || 0);
    const mrpt = parseFloat(document.getElementById('ad-mrpt')?.value || 0) || (mrps / tps);
    await POST('/drugs', {
      name, brand: document.getElementById('ad-brand')?.value || '',
      composition: document.getElementById('ad-comp')?.value || '',
      category: document.getElementById('ad-cat')?.value || '',
      schedule: document.getElementById('ad-sched')?.value || 'OTC',
      hsn: document.getElementById('ad-hsn')?.value || '30049099',
      tablets_per_strip: tps, strips_per_box: 10,
      mrp_per_strip: mrps, mrp_per_tablet: mrpt,
      reorder_level: parseInt(document.getElementById('ad-reorder')?.value || 20),
      pack_type: document.getElementById('ad-pack')?.value || 'Strip'
    });
    closeModal();
    toast('Drug added ✅', 'success');
    drugs = await GET('/inventory');
    c.innerHTML = html();
  };

  window.showEditDrug = async (id) => {
    const d = await GET('/drugs/' + id);
    modal('✏️ Edit Drug', `
      <div class="grid-2">
        <div class="field"><label>Drug Name</label><input class="input" id="ed-name" value="${d.name}"></div>
        <div class="field"><label>Brand</label><input class="input" id="ed-brand" value="${d.brand || ''}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>MRP / Pack (₹)</label><input class="input" type="number" id="ed-mrps" value="${d.mrp_per_strip || 0}" step="0.5"></div>
        <div class="field"><label>Packaging Type</label>
          <select class="select" id="ed-pack">
            <option value="Strip" ${d.pack_type === 'Strip' ? 'selected' : ''}>Strip</option>
            <option value="Bottle" ${d.pack_type === 'Bottle' ? 'selected' : ''}>Bottle</option>
            <option value="Tube" ${d.pack_type === 'Tube' ? 'selected' : ''}>Tube</option>
            <option value="Piece" ${d.pack_type === 'Piece' ? 'selected' : ''}>Piece</option>
            <option value="Box" ${d.pack_type === 'Box' ? 'selected' : ''}>Box</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>MRP / Item (₹)</label><input class="input" type="number" id="ed-mrpt" value="${d.mrp_per_tablet || 0}" step="0.01"></div>
      </div>
      <div class="field"><label>Reorder Level (tabs)</label><input class="input" type="number" id="ed-reorder" value="${d.reorder_level || 20}"></div>
      `,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="updateDrug(${id})">Save Changes</button>`
    );
  };

  window.updateDrug = async (id) => {
    await PUT('/drugs/' + id, {
      name: document.getElementById('ed-name')?.value || undefined,
      brand: document.getElementById('ed-brand')?.value || undefined,
      mrp_per_strip: parseFloat(document.getElementById('ed-mrps')?.value) || undefined,
      mrp_per_tablet: parseFloat(document.getElementById('ed-mrpt')?.value) || undefined,
      reorder_level: parseInt(document.getElementById('ed-reorder')?.value) || undefined,
      pack_type: document.getElementById('ed-pack')?.value || undefined
    });
    closeModal();
    toast('Drug updated ✅', 'success');
    drugs = await GET('/inventory');
    c.innerHTML = html();
  };

  window.showExpiryReturn = async (drug_id, drug_name) => {
    const d = await GET('/drugs/' + drug_id);
    const sups = await GET('/suppliers');
    const batches = d.batches.filter(b => b.full_strips > 0);
    if (!batches.length) { toast('No stock to return', 'warn'); return; }
    modal('↩ Return Expiring Stock', `
      <div class="alert-strip warn">Returning stock will deduct it from your inventory.</div>
      <div class="field"><label>Drug</label><input class="input" value="${drug_name}" disabled></div>
      <div class="field"><label>Batch to Return</label>
        <select class="select" id="er-batch">
          ${batches.map(b => `<option value="${b.id}">Batch ${b.batch_no} · Exp ${b.expiry} · ${b.full_strips} strips</option>`).join('')}
        </select></div>
      <div class="field"><label>Strips to Return</label><input class="input" type="number" id="er-strips" value="1" min="1"></div>
      <div class="field"><label>Supplier</label>
        <select class="select" id="er-sup">
          <option value="">— Select supplier —</option>
          ${sups.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select></div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="saveExpiryReturn(${drug_id})">Confirm Return</button>`
    );
  };

  window.saveExpiryReturn = async (drug_id) => {
    const batch_id       = parseInt(document.getElementById('er-batch')?.value);
    const strips_returned = parseInt(document.getElementById('er-strips')?.value || 1);
    const supplier_id    = parseInt(document.getElementById('er-sup')?.value) || null;
    await POST('/expiry_returns', { drug_id, batch_id, supplier_id, strips_returned, reason: 'expiry' });
    closeModal();
    toast('Expiry return logged ✅', 'success');
    drugs = await GET('/inventory');
    c.innerHTML = html();
  };

  window.showExpiringManager = async () => {
    const expiredList = await GET('/expired');
    modal('Expiring / Expired Stock', `
      <div class="alert-strip warn" style="margin-bottom:16px">These batches expire within 3 months or have already expired. You should return them to the supplier for credit.</div>
      <div style="max-height:60vh;overflow-y:auto;padding-right:4px">
        ${expiredList.length === 0 ? '<div style="text-align:center;color:var(--muted);padding:24px">No expiring stock right now.</div>' : ''}
        ${expiredList.map(b => `
          <div class="card" style="margin-bottom:8px;padding:12px;border:1px solid ${b.expiry < new Date().toISOString().slice(0,10) ? 'var(--danger)' : 'var(--warn)'}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:800;color:var(--text)">${b.drug_name} <span style="font-weight:400;color:var(--muted);font-size:11px">${b.brand || ''}</span></div>
                <div style="font-size:11px">Batch: <span style="font-family:monospace;font-weight:700">${b.batch_no}</span> · Exp: <b style="color:var(--danger)">${b.expiry}</b></div>
              </div>
              <div style="text-align:right">
                <div style="font-size:11px;color:var(--muted)">Stock Available:</div>
                <div style="font-weight:800;font-size:14px;color:var(--accent)">${b.full_strips} strips</div>
              </div>
            </div>
            <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);display:flex;gap:8px">
              <input type="number" id="ret-qty-${b.id}" class="input" value="${b.full_strips}" style="width:80px;font-size:12px" min="1" max="${b.full_strips}">
              <select class="select" id="ret-sup-${b.id}" style="flex:1;font-size:12px"></select>
              <button class="btn btn-outline" style="color:var(--warn);border-color:var(--warn)44;font-size:11px" onclick="execBatchReturn(${b.drug_id}, ${b.id})">Return to Supplier</button>
            </div>
          </div>
        `).join('')}
      </div>
    `);

    if (expiredList.length > 0) {
      const sups = await GET('/suppliers');
      const suppOptions = `<option value="">— Select Supplier —</option>` + sups.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      expiredList.forEach(b => {
        const sel = document.getElementById('ret-sup-' + b.id);
        if (sel) {
          sel.innerHTML = suppOptions;
          if (b.default_supplier) sel.value = b.default_supplier;
        }
      });
    }
  };

  window.execBatchReturn = async (drug_id, batch_id) => {
    const btn = event.currentTarget;
    btn.disabled = true; btn.textContent = 'Processing...';
    
    const strips = parseInt(document.getElementById('ret-qty-' + batch_id)?.value);
    const sup_id = parseInt(document.getElementById('ret-sup-' + batch_id)?.value);
    
    if (!strips || strips <= 0) { toast('Invalid quantity', 'warn'); btn.disabled = false; return; }
    if (!sup_id) { toast('Please select supplier', 'warn'); btn.disabled = false; return; }

    try {
      await POST('/expiry_returns', { drug_id, batch_id, supplier_id: sup_id, strips_returned: strips, reason: 'expiry' });
      toast('Returned successfully', 'success');
      
      // refresh lists
      drugs = await GET('/inventory');
      c.innerHTML = html();
      showExpiringManager();
    } catch(e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = 'Return to Supplier';
    }
  };
}
