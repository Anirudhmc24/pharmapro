// trays.js + stock_entry.js combined
import { GET, POST } from './api.js';
import { tag, stripVis, fmtExp, expiryColor, monthsLeft, fmt, toast, compressImage } from './utils.js';

export async function renderTrays(c, APP) {
  const trays  = await GET('/trays?open_only=true');
  const alertAt = parseInt(APP.config.broken_strip_alert || 2);

  c.innerHTML = `<div class="gap-16 fade-in">
    <div class="flex-between">
      <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Tray Tracker</h2>
        <div style="color:var(--muted);font-size:12px">${trays.length} open trays</div></div>
    </div>
    <div class="alert-strip info">
      💡 When a strip is cut during billing, a tray record is auto-created with expiry from the original batch. Print the label and stick it on the physical tray.
    </div>
    ${trays.length === 0 ? '<div class="card" style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:48px;margin-bottom:12px">✂️</div><div>No open trays right now</div></div>' : `
    <div class="gap-12">
      ${trays.map(t => {
        const critical = t.tablets_remaining <= alertAt;
        const color    = critical ? 'var(--warn)' : 'var(--accent)';
        return `<div class="card" style="border-color:${critical ? 'var(--warn)44' : 'var(--border)'}">
          <div class="flex-between" style="margin-bottom:12px">
            <div class="row">
              <span style="font-family:monospace;font-weight:800;color:${color};font-size:14px">${t.tray_id}</span>
              <span style="font-weight:700;color:var(--text)">${t.drug_name}</span>
              <span style="color:var(--muted);font-size:12px">${t.brand || ''}</span>
              ${critical ? tag('⚠️ Almost empty', 'tag-amber') : ''}
            </div>
            <button class="btn btn-outline btn-sm" onclick="printTrayLabel('${t.tray_id}','${t.drug_name.replace(/'/g,"\\'")}','${t.batch_no}','${t.expiry}',${t.tablets_remaining},${t.tablets_per_strip || 10},'${t.box_id || ''}')">🖨️ Label</button>
          </div>
          ${stripVis(t.tablets_per_strip || 10, t.tablets_remaining, color)}
          <div style="margin-top:10px;display:flex;gap:14px;font-size:12px;color:var(--muted);flex-wrap:wrap">
            <span>Batch: <b style="color:var(--text)">${t.batch_no}</b></span>
            <span>Expiry: <b style="color:${expiryColor(t.expiry)}">${fmtExp(t.expiry)}</b></span>
            <span>Location: <b style="color:var(--accent)">Box ${t.box_id || '?'}</b></span>
            <span>Opened: ${t.opened_on}</span>
            <span style="color:${color};font-weight:800">${t.tablets_remaining}/${t.tablets_per_strip || 10} tabs</span>
          </div>
        </div>`;
      }).join('')}
    </div>`}
  </div>`;

  window.printTrayLabel = (tid, drug, batch, expiry, tabs, tps, boxId) => {
    const ml  = monthsLeft(expiry);
    const col = ml <= 0 ? '#ef4444' : ml <= 3 ? '#f59e0b' : '#10b981';
    const w   = window.open('', '_blank', 'width=320,height=420');
    w.document.write(`<html><body style="font-family:monospace;padding:16px;background:#fff;color:#111">
      <div style="font-size:9px;font-weight:700;letter-spacing:2px;color:#666;margin-bottom:6px">PHARMAPRO TRAY LABEL</div>
      <div style="font-size:18px;font-weight:900;margin-bottom:2px">${drug}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0">
        <div style="background:#f5f5f5;border-radius:6px;padding:6px 8px">
          <div style="font-size:9px;color:#999;font-weight:700;letter-spacing:1px">BATCH</div>
          <div style="font-size:14px;font-weight:800">${batch}</div>
        </div>
        <div style="background:${ml <= 3 ? '#fff3e0' : '#e8faf3'};border-radius:6px;padding:6px 8px;border:1px solid ${col}44">
          <div style="font-size:9px;color:#999;font-weight:700;letter-spacing:1px">EXPIRY</div>
          <div style="font-size:14px;font-weight:900;color:${col}">${fmtExp(expiry)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid #eee;padding-top:8px">
        <div><div style="font-size:9px;color:#999;font-weight:700">TABLETS LEFT</div>
          <div style="font-size:22px;font-weight:900">${tabs} <span style="font-size:12px;color:#999">/ ${tps}</span></div></div>
        <div style="text-align:right"><div style="font-size:9px;color:#999;font-weight:700">TRAY ID</div>
          <div style="font-size:16px;font-weight:800">${tid}</div>
          <div style="font-size:9px;color:#999">Box: ${boxId}</div></div>
      </div>
      ${ml <= 0 ? '<div style="margin-top:8px;background:#fde8e8;border-radius:6px;padding:5px 8px;color:#ef4444;font-weight:800;font-size:12px;text-align:center">⛔ EXPIRED — DO NOT DISPENSE</div>' : ''}
      ${ml > 0 && ml <= 3 ? '<div style="margin-top:8px;background:#fff3e0;border-radius:6px;padding:5px 8px;color:#f59e0b;font-weight:800;font-size:12px;text-align:center">⚠️ Expires soon — use first</div>' : ''}
      <script>window.print();window.close();<\/script>
    </body></html>`);
  };
}


export async function renderStockEntry(c, APP) {
  const [sups, layout] = await Promise.all([GET('/suppliers'), GET('/layout').catch(() => [])]);
  let mode = 'keyboard', added = [];

  function html() {
    return `<div class="gap-16 fade-in">
      <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Stock Entry</h2>
        <div style="color:var(--muted);font-size:12px">Add incoming stock to inventory</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
        ${[['keyboard','⌨️','Fast Type','Search drug, fill batch'],
           ['camera','📷','Scan Strip','Webcam AI reading'],
           ['challan','📄','Invoice','Photo entire invoice'],
           ['adjust','⚖️','Adjust','Stock write-offs']].map(([m, icon, lbl, desc]) => `
        <button onclick="setMode('${m}')" style="background:${mode === m ? 'var(--accent-dim)' : 'var(--card)'};border:2px solid ${mode === m ? 'var(--accent)' : 'var(--border)'};border-radius:14px;padding:16px;cursor:pointer;text-align:left;transition:all .2s">
          <div style="font-size:24px;margin-bottom:6px">${icon}</div>
          <div style="font-weight:800;color:${mode === m ? 'var(--accent)' : 'var(--text)'};font-size:14px">${lbl}</div>
          <div style="color:var(--muted);font-size:11px;margin-top:3px">${desc}</div>
        </button>`).join('')}
      </div>
      <div id="mode-panel">${modePanel()}</div>
      ${added.length ? `<div class="card-sm">
        <div class="section-title">Added this session (${added.length})</div>
        ${added.map(e => `<div class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border)22;font-size:13px">
          <span style="font-weight:700">${e.drug_name}</span>
          <div style="display:flex;gap:6px"><span class="tag tag-teal">+${e.strips} strips</span><span class="tag tag-green">${fmtExp(e.expiry)}</span></div>
        </div>`).join('')}
      </div>` : ''}
    </div>`;
  }

  function modePanel() {
    if (mode === 'keyboard') return `<div class="card">
      <div class="section-title">Search Drug</div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:10px">Type 2+ letters to search <b style="color:var(--accent)">253,000+ Indian medicines</b>. Select one to add stock.</div>
      <input class="input" id="stock-search" placeholder="e.g. Glycomet, Augmentin, Paracetamol…" autofocus oninput="stockSearch(this.value)" autocomplete="off" style="margin-bottom:4px">
      <div id="stock-drop" style="display:none;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:12px;max-height:320px;overflow-y:auto;background:var(--card);box-shadow:0 4px 20px #00000066"></div>
      <div id="stock-form" style="display:none"></div>
    </div>`;
    if (mode === 'camera') return `<div class="card" style="text-align:center;padding:32px">
      <div style="font-size:36px;margin-bottom:12px">📷</div>
      <div style="font-weight:800;color:var(--text);font-size:15px;margin-bottom:4px">Camera Strip Scan</div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:16px">Point camera at a strip — Gemini AI reads drug name, batch & expiry automatically</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="startCameraScan()">📷 Open Camera</button>
        <button class="btn btn-outline" onclick="var f=document.getElementById('strip-file');f.value='';f.click()">📁 Upload Photo</button>
      </div>
      <input type="file" id="strip-file" accept="image/*" capture="environment" class="file-input-hidden" onchange="handleStripFile(this.files[0])">
      <div id="camera-area" style="margin-top:16px"></div>
    </div>`;
    if (mode === 'challan') return `<div class="card">
      <div style="color:var(--muted);font-size:13px;margin-bottom:14px">📌 Upload a photo of your supplier invoice. Gemini AI will read all medicines and show them as a <b style="color:var(--text)">list for you to verify one-by-one</b> before adding to stock.</div>
      <div style="border:2px dashed var(--border);border-radius:12px;padding:36px;text-align:center;cursor:pointer;transition:border-color .2s"
        onclick="var f=document.getElementById('challan-file');f.value='';f.click()"
        ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
        ondrop="handleChallaDrop(event)">
        <div style="font-size:36px;margin-bottom:10px">📄</div>
        <div style="font-weight:800;color:var(--text);font-size:15px;margin-bottom:4px">Upload invoice photo</div>
        <div style="color:var(--muted);font-size:12px;margin-bottom:16px">JPG · PNG · Printed or handwritten challan</div>
        <div class="btn btn-primary" style="display:inline-flex">Select File</div>
        <input type="file" id="challan-file" accept="image/*" capture="environment" class="file-input-hidden" onchange="handleChallaScan(this.files[0])">
      </div>
      <div id="challan-result" style="margin-top:16px"></div>
    </div>`;
    if (mode === 'adjust') return `<div class="card">
      <div class="section-title">⚖️ Stock Adjustment</div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:12px">Correct stock counts for damages, theft, or physical count mismatch. Search drug to begin.</div>
      <div class="search-wrap" style="margin-bottom:14px">
        <span class="search-icon">⌨️</span>
        <input class="input" id="adj-search" placeholder="Search drug to adjust…" autofocus oninput="adjSearch(this.value)" autocomplete="off">
        <div class="search-drop" id="adj-drop" style="display:none"></div>
      </div>
      <div id="adj-form" style="display:none"></div>
    </div>`;
    return '';
  }

  function supOpts() {
    return `<option value="">-- No Supplier --</option>` + sups.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }

  window._layout = layout;
  window.updateComps = (fixId, destComp, destBox) => {
    const fix = window._layout[fixId];
    const compSel = document.getElementById(destComp);
    const boxSel = document.getElementById(destBox);
    compSel.innerHTML = '<option value="">- Select -</option>';
    boxSel.innerHTML = '<option value="">- Select -</option>';
    if (fix && fix.compartments) {
      fix.compartments.forEach((c, i) => compSel.innerHTML += `<option value="${i}">${c.name}</option>`);
    }
  };
  window.updateBoxes = (fixId, compId, destBox) => {
    const fix = window._layout[fixId];
    const comp = fix?.compartments?.[compId];
    const boxSel = document.getElementById(destBox);
    boxSel.innerHTML = '<option value="">- Select -</option>';
    if (comp && comp.boxes) {
      comp.boxes.forEach(b => boxSel.innerHTML += `<option value="${b.id}">${b.name}</option>`);
    }
  };

  function fixtureOpts(defBoxId) {
    let html = `<option value="">-- Choose Fixture --</option>`;
    layout.forEach((f, i) => html += `<option value="${i}">${f.name}</option>`);
    return html;
  }

  function stockFormHTML(drug) {
    return `<div class="gap-12">
      <div class="alert-strip info">✅ ${drug.name} · ${drug.tablets_per_strip || 10} tabs/strip · Base MRP ₹${drug.mrp_per_strip || 0}/strip</div>
      <div class="grid-2">
        <div class="field"><label>Batch No.</label><input class="input" name="batch_no" id="sf-batch" placeholder="e.g. B25-001 (optional)"></div>
        <div class="field"><label>Expiry *</label><input class="input" type="month" name="expiry" id="sf-exp"></div>
      </div>
      <div class="grid-3">
        <div class="field"><label>Strips Received *</label><input class="input" type="number" name="strips" id="sf-qty" value="1" min="1"></div>
        <div class="field"><label>Free / Bonus</label><input class="input" type="number" name="free" id="sf-free" value="0" min="0"></div>
        <div class="field"><label>Cost / Strip (₹)</label><input class="input" type="number" name="cost" id="sf-cost" placeholder="Optional" step="0.5"></div>
      </div>
      <div class="grid-3">
        <div class="field"><label>Supplier</label><select class="select" id="sf-sup">${supOpts()}</select></div>
        <div class="field"><label>MRP Override (₹)</label><input class="input" type="number" id="sf-mrp" value="${drug.mrp_per_strip || 0}" step="0.5" title="MRP for this specific batch"></div>
        <div class="field"><label>GST %</label><select class="select" id="sf-gst"><option value="0">0%</option><option value="5" ${APP.config.gst_slab=='5'?'selected':''}>5%</option><option value="12" ${APP.config.gst_slab=='12'?'selected':''}>12%</option><option value="18" ${APP.config.gst_slab=='18'?'selected':''}>18%</option></select></div>
      </div>
      <div class="section-title" style="margin-top:10px;margin-bottom:0px">Physical Placement</div>
      <div class="grid-3" style="margin-bottom:10px">
        <div class="field"><label>Fixture</label><select class="select" id="sf-fix" onchange="updateComps(this.value, 'sf-comp', 'sf-box')">${fixtureOpts(drug.box_id)}</select></div>
        <div class="field"><label>Compartment/Shelf</label><select class="select" id="sf-comp" onchange="updateBoxes(document.getElementById('sf-fix').value, this.value, 'sf-box')"><option value="">- Select Fixture First -</option></select></div>
        <div class="field"><label>Box/Tray</label><select class="select" id="sf-box"><option value="">- Select Compartment First -</option></select></div>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="submitStock(${drug.id},'${drug.name.replace(/'/g,"\\'")}')">✅ Add to Stock</button>
    </div>`;
  }

  c.innerHTML = html();
  window.setMode = (m) => { mode = m; c.innerHTML = html(); };

  window.stockSearch = async (q) => {
    const drop = document.getElementById('stock-drop');
    if (q.length < 1) { drop.style.display = 'none'; return; }

    // Search local shop drugs (always)
    const localDrugs = await GET('/drugs?q=' + encodeURIComponent(q));

    // Search Master Catalogue for 2+ chars
    let masterDrugs = [];
    if (q.length >= 2) {
      try {
        masterDrugs = await GET('/drugs/master_search?q=' + encodeURIComponent(q));
        if (!Array.isArray(masterDrugs)) masterDrugs = [];
      } catch(e) {
        masterDrugs = [];
      }
    }

    window._stockDrugs = window._stockDrugs || {};
    let html = '';

    const itemStyle = 'padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e2d4222;transition:background .15s;';

    // ── Local Shop Results ──────────────────────────────────
    if (localDrugs.length > 0) {
      html += `<div style="padding:4px 12px;font-size:10px;font-weight:700;color:var(--accent);background:var(--accent-dim)">YOUR SHOP</div>`;
      localDrugs.slice(0, 5).forEach(d => {
        window._stockDrugs[d.id] = d;
        html += `<div style="${itemStyle}" onmouseover="this.style.background='#ffffff08'" onmouseout="this.style.background=''" onclick="stockSelectDrug(${d.id})">
          <div><div style="font-weight:700">${d.name}</div><div style="font-size:11px;color:var(--muted)">${d.brand || ''}</div></div>
          <div style="color:var(--accent);font-size:12px;font-weight:700">₹${d.mrp_per_strip || 0}</div>
        </div>`;
      });
    }

    // ── Global Master Results ───────────────────────────────
    if (masterDrugs.length > 0) {
      html += `<div style="padding:4px 12px;font-size:10px;font-weight:700;color:var(--warn);background:var(--warn-dim)">MASTER DATABASE · 253,000+ medicines</div>`;
      masterDrugs.slice(0, 8).forEach(d => {
        const comp = d.composition || '';
        const compShort = comp.length > 40 ? comp.substring(0, 40) + '…' : comp;
        const safeD = JSON.stringify(d).replace(/'/g, "&apos;");
        html += `<div style="${itemStyle}" onmouseover="this.style.background='#ffffff08'" onmouseout="this.style.background=''" onclick='showManualEntryFromMaster(${safeD})'>
          <div style="flex:1">
            <div style="font-weight:700">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.manufacturer || ''} ${compShort ? '· ' + compShort : ''}</div>
          </div>
          <div style="color:var(--warn);font-size:11px;font-weight:700;white-space:nowrap;margin-left:8px;padding:4px 8px;border:1px solid var(--warn);border-radius:6px">+ Add Stock</div>
        </div>`;
      });
    } else if (q.length >= 2) {
      html += `<div style="padding:10px 14px;font-size:12px;color:var(--muted)">No results for "${q}" in master database</div>`;
    }

    // ── Manual add fallback ─────────────────────────────────
    const escapedQ = q.replace(/'/g, "\\'");
    html += `<div style="${itemStyle}color:var(--accent);border-top:2px solid var(--border)" onmouseover="this.style.background='#ffffff08'" onmouseout="this.style.background=''" onclick="showManualEntry('${escapedQ}')">
      <div>➕ <b>Add "${q}" as new medicine</b></div>
      <div style="font-size:11px;color:var(--muted)">Fill details manually</div>
    </div>`;

    drop.innerHTML = html;
    drop.style.display = 'block';
  };


  window.showManualEntryFromMaster = (d) => {
    window.showManualEntry(d.name);
    setTimeout(() => {
      if (document.getElementById('me-name')) {
        document.getElementById('me-brand').value = d.manufacturer;
        document.getElementById('me-comp').value = d.composition;
        document.getElementById('me-mrps').value = d.mrp || 0;
        toast('Imported details from Master List!', 'info');
      }
    }, 100);
  };

  window.stockSelectDrug = (id) => {
    const drug = window._stockDrugs?.[id];
    if (!drug) { toast('Drug not found, try searching again', 'warn'); return; }
    document.getElementById('stock-drop').style.display = 'none';
    document.getElementById('stock-search').value = drug.name;
    const form = document.getElementById('stock-form');
    form.style.display = 'block';
    form.innerHTML = stockFormHTML(drug);
  };

  /* ── Manual entry form for new/unknown drugs ── */
  window.showManualEntry = (prefillName) => {
    document.getElementById('stock-drop').style.display = 'none';
    document.getElementById('stock-search').value = '';
    const form = document.getElementById('stock-form');
    form.style.display = 'block';
    form.innerHTML = `<div class="gap-12">
      <div class="alert-strip info">✏️ This drug is not in your catalogue yet. Fill the details below — it will be <b>added to your catalogue and stock at once</b>.</div>
      <div class="grid-2">
        <div class="field"><label>Drug Name (with strength) *</label><input class="input" id="me-name" placeholder="e.g. Albuterol 4mg" value="${prefillName || ''}"></div>
        <div class="field"><label>Brand Name</label><input class="input" id="me-brand" placeholder="e.g. Asthalin"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Composition / Active Ingredient</label><input class="input" id="me-comp" placeholder="e.g. Salbutamol"></div>
        <div class="field"><label>Category</label><input class="input" id="me-cat" placeholder="e.g. Bronchodilator"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Schedule</label>
          <select class="select" id="me-sched"><option value="OTC">OTC (No prescription)</option><option value="Rx">Rx (Prescription required)</option><option value="H">H (Hospital only)</option></select></div>
        <div class="field"><label>Tablets / Strip</label><input class="input" type="number" id="me-tps" value="10" min="1"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>MRP per Strip (₹) *</label><input class="input" type="number" id="me-mrps" placeholder="0.00" step="0.5" oninput="me_autoMrpTab()"></div>
        <div class="field"><label>MRP per Tablet (₹)</label><input class="input" type="number" id="me-mrpt" placeholder="Auto-calculated" step="0.01"></div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
        <div class="section-title">First Stock Batch</div>
        <div class="grid-2">
          <div class="field"><label>Batch No.</label><input class="input" id="me-batch" placeholder="e.g. B25-001 (optional)"></div>
          <div class="field"><label>Expiry *</label><input class="input" type="month" id="me-exp"></div>
        </div>
      <div class="grid-3" style="margin-top:8px">
        <div class="field"><label>Strips Received</label><input class="input" type="number" id="me-strips" value="1" min="1"></div>
        <div class="field"><label>Free Strips</label><input class="input" type="number" id="me-free" value="0" min="0"></div>
        <div class="field"><label>Cost / Strip (₹)</label><input class="input" type="number" id="me-cost" placeholder="Optional" step="0.5"></div>
      </div>
      <div class="grid-3">
        <div class="field"><label>Supplier</label><select class="select" id="me-sup">${supOpts()}</select></div>
        <div class="field"><label>GST %</label><select class="select" id="me-gst"><option value="0">0%</option><option value="5">5%</option><option value="12" selected>12%</option><option value="18">18%</option></select></div>
      </div>
      <div class="section-title" style="margin-top:10px;margin-bottom:0px">Physical Placement <span style="font-size:10px;color:var(--muted);font-weight:400">(optional — you can set this later)</span></div>
      <div class="grid-3" style="margin-bottom:10px">
        <div class="field"><label>Fixture</label><select class="select" id="me-fix" onchange="updateComps(this.value, 'me-shelf', 'me-location')"><option value="">-- No fixture yet --</option>${layout.map((f,i)=>`<option value="${i}">${f.name}</option>`).join('')}</select></div>
        <div class="field"><label>Compartment/Shelf</label><select class="select" id="me-shelf" onchange="updateBoxes(document.getElementById('me-fix').value, this.value, 'me-location')"><option value="">- Select Fixture First -</option></select></div>
        <div class="field"><label>Box/Tray</label><select class="select" id="me-location"><option value="">- Select Compartment First -</option></select></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline" style="flex:1" onclick="cancelManualEntry()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="submitNewDrugAndStock()">✅ Add Drug & Stock</button>
      </div>
    </div>`;
  };

  window.me_autoMrpTab = () => {
    const mrps = parseFloat(document.getElementById('me-mrps')?.value || 0);
    const tps  = parseInt(document.getElementById('me-tps')?.value || 10);
    const mrptEl = document.getElementById('me-mrpt');
    if (mrptEl && mrps > 0 && tps > 0) mrptEl.value = (mrps / tps).toFixed(2);
  };

  window.cancelManualEntry = () => {
    const form = document.getElementById('stock-form');
    form.style.display = 'none'; form.innerHTML = '';
    document.getElementById('stock-search').value = '';
  };

  window.submitNewDrugAndStock = async () => {
    const name   = document.getElementById('me-name')?.value?.trim();
    const mrps   = parseFloat(document.getElementById('me-mrps')?.value || 0);
    const tps    = parseInt(document.getElementById('me-tps')?.value || 10);
    const mrpt   = parseFloat(document.getElementById('me-mrpt')?.value || 0) || (mrps / tps);
    const batch  = document.getElementById('me-batch')?.value?.trim();
    const expiry = document.getElementById('me-exp')?.value;
    const strips = parseInt(document.getElementById('me-strips')?.value || 1);
    const free   = parseInt(document.getElementById('me-free')?.value || 0);
    const cost   = parseFloat(document.getElementById('me-cost')?.value || 0);
    const sup_id = document.getElementById('me-sup')?.value || null;
    const gst    = parseFloat(document.getElementById('me-gst')?.value || 0);
    const box_id = parseInt(document.getElementById('me-location')?.value) || null;
    if (!name)   { toast('Drug name is required', 'warn'); return; }
    if (!expiry) { toast('Expiry date is required', 'warn'); return; }
    if (monthsLeft(expiry) <= 0) { toast('⛔ That expiry date is already past', 'error'); return; }
    try {
      // 1. Create the drug in catalogue
      const newDrug = await POST('/drugs', {
        name, brand: document.getElementById('me-brand')?.value || '',
        composition: document.getElementById('me-comp')?.value || '',
        category:    document.getElementById('me-cat')?.value || '',
        schedule:    document.getElementById('me-sched')?.value || 'OTC',
        hsn: '30049099', tablets_per_strip: tps, strips_per_box: 10,
        mrp_per_strip: mrps, mrp_per_tablet: mrpt, reorder_level: 20,
        box_id, zone: 'B',
      });
      // 2. Add the first batch
      await POST('/batches', { 
        drug_id: newDrug.id, batch_no: batch, expiry, strips, free_strips: free,
        cost_per_strip: cost, mrp_per_strip: mrps, gst_pct: gst, supplier_id: sup_id, box_id
      });
      added.push({ drug_name: name, strips: strips+free, expiry });
      toast(`${name} added to catalogue & ${strips+free} strips to stock ✅`, 'success');
      c.innerHTML = html();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  };

  window.submitStock = async (drug_id, drug_name) => {
    const batch_no = document.getElementById('sf-batch')?.value?.trim() || '';
    const expiry   = document.getElementById('sf-exp')?.value || '';
    const strips   = parseInt(document.getElementById('sf-qty')?.value || 1);
    const free     = parseInt(document.getElementById('sf-free')?.value || 0);
    const cost     = parseFloat(document.getElementById('sf-cost')?.value || 0);
    const mrp      = parseFloat(document.getElementById('sf-mrp')?.value || 0);
    const sup_id   = document.getElementById('sf-sup')?.value || null;
    const gst      = parseFloat(document.getElementById('sf-gst')?.value || 0);
    const box_id   = parseInt(document.getElementById('sf-box')?.value) || null;
    if (!expiry) { toast('Expiry date required', 'warn'); return; }
    if (monthsLeft(expiry) <= 0) { toast('⛔ That expiry is already past', 'error'); return; }
    await POST('/batches', { drug_id, batch_no, expiry, strips, cost_per_strip: cost, box_id, free_strips: free, mrp_per_strip: mrp, gst_pct: gst, supplier_id: sup_id });
    added.push({ drug_name, strips, expiry });
    toast(`${drug_name} · ${strips} strips added ✅`, 'success');
    document.getElementById('stock-search').value = '';
    document.getElementById('stock-form').style.display = 'none';
    c.innerHTML = html();
  };

  window.startCameraScan = async () => {
    const area = document.getElementById('camera-area');

    // First check if getUserMedia is available (not always in WebView)
    const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    if (!hasGetUserMedia) {
      // Fallback: use the file input with capture="environment" to open system camera
      area.innerHTML = `<div class="alert-strip info">📷 Opening system camera…</div>`;
      const fileInput = document.getElementById('strip-file');
      if (fileInput) { fileInput.value = ''; fileInput.click(); }
      return;
    }

    area.innerHTML = `<div style="position:relative;margin-top:12px">
      <video id="cam-video" autoplay playsinline muted style="width:100%;border-radius:10px;border:1px solid var(--border)"></video>
      <button class="btn btn-primary" style="margin-top:10px;width:100%" onclick="captureStrip()">📸 Capture</button>
      <button class="btn btn-outline" style="margin-top:6px;width:100%" onclick="stopCamera()">✕ Close Camera</button>
      <canvas id="cam-canvas" style="display:none"></canvas>
    </div>`;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      const video = document.getElementById('cam-video');
      video.srcObject = stream;
      // Explicitly play — required on mobile
      await video.play();
    } catch (e) {
      console.error('Camera error:', e);
      // Fallback: try system camera via file input instead of just showing error
      area.innerHTML = `<div class="alert-strip info" style="margin-bottom:8px">📷 Live camera unavailable — opening system camera instead…</div>`;
      const fileInput = document.getElementById('strip-file');
      if (fileInput) { fileInput.value = ''; fileInput.click(); }
    }
  };


  window.stopCamera = () => {
    const video = document.getElementById('cam-video');
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    const area = document.getElementById('camera-area');
    if (area) area.innerHTML = '';
  };

  window.quickAddMasterFromScan = (name, batch, expiry, mrp) => {
    window._onDrugAdded = (newDrug) => {
      window._stockDrugs = window._stockDrugs || {};
      window._stockDrugs[newDrug.id] = newDrug;
      window.stockSelectDrug(newDrug.id);
      setTimeout(() => {
        const bEl = document.querySelector('[name=batch_no]'); if (bEl) bEl.value = batch || '';
        const eEl = document.querySelector('[name=expiry]');   if (eEl) eEl.value = expiry || '';
      }, 100);
    };
    window.showAddDrug({ name, batch, expiry: window.normalizeExpiry ? window.normalizeExpiry(expiry) : expiry, mrps: mrp });
  };

  const handleScanResult = async (r, area) => {
    area.innerHTML = `<div class="alert-strip success">✅ Strip read successfully</div>`;
    const normalizedExp = window.normalizeExpiry ? window.normalizeExpiry(r.expiry || '') : (r.expiry || '');
    const drugs = await GET('/drugs?q=' + encodeURIComponent((r.drug_name || '').split(' ')[0]));
    if (drugs[0]) {
      window._stockDrugs = window._stockDrugs || {};
      window._stockDrugs[drugs[0].id] = drugs[0];
      window.stockSelectDrug(drugs[0].id);
      setTimeout(() => {
        const bEl = document.querySelector('[name=batch_no]'); if (bEl) bEl.value = r.batch_no || '';
        const eEl = document.querySelector('[name=expiry]');   if (eEl) eEl.value = normalizedExp;
      }, 100);
    } else {
      area.innerHTML += `
        <div class="alert-strip warn" style="margin-bottom:8px">⚠️ "${r.drug_name || 'Item'}" not found in catalogue</div>
        <div class="card" style="padding:12px;margin-top:8px;border:1px dashed var(--warn);background:var(--accent-dim)">
          <div style="font-weight:800;font-size:12px;margin-bottom:4px;color:var(--text)">📋 SCANNED DETAILS (Edit if needed):</div>
          <div style="font-size:11px;color:var(--muted);line-height:1.4">
            <b>Name:</b> <input class="input" id="sc-name" value="${(r.drug_name || '').replace(/"/g, '&quot;')}" style="font-weight:bold;margin:2px 0;height:26px;font-size:11px;padding:2px 6px"><br>
            <b>Batch:</b> <input class="input" id="sc-batch" value="${(r.batch_no || '').replace(/"/g, '&quot;')}" style="margin:2px 0;height:26px;font-size:11px;padding:2px 6px"><br>
            <b>Expiry:</b> <input class="input" id="sc-expiry" value="${normalizedExp}" style="margin:2px 0;height:26px;font-size:11px;padding:2px 6px" placeholder="YYYY-MM"><br>
            <b>MRP:</b> <input class="input" type="number" id="sc-mrp" value="${r.mrp || 0}" style="margin:2px 0;height:26px;font-size:11px;padding:2px 6px">
          </div>
          <button class="btn btn-primary btn-sm" style="margin-top:10px;width:100%" 
            onclick="quickAddMasterFromScanEdited()">
            ➕ Add to Master Directory & Stock
          </button>
        </div>`;
      
      window.quickAddMasterFromScanEdited = () => {
        const name = document.getElementById('sc-name')?.value || '';
        const batch = document.getElementById('sc-batch')?.value || '';
        const expiry = document.getElementById('sc-expiry')?.value || '';
        const mrp = parseFloat(document.getElementById('sc-mrp')?.value || 0);
        window.quickAddMasterFromScan(name, batch, expiry, mrp);
      };
    }
  };

  // Handle file-based strip scan (fallback for mobile)
  window.handleStripFile = async (file) => {
    if (!file) return;
    const area = document.getElementById('camera-area');
    area.innerHTML = '<div class="row" style="justify-content:center;padding:16px"><div class="spinner"></div><span style="color:var(--muted)">Reading strip with Gemini…</span></div>';
    let b64;
    let mime = 'image/jpeg';
    try {
      b64 = await compressImage(file);
    } catch (err) {
      console.error("Compression failed, falling back to raw upload:", err);
      b64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
      mime = file.type || 'image/jpeg';
    }
    const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_b64: b64, mime: mime, mode: 'strip' }) }).then(r => r.json());
    if (!res.ok) { area.innerHTML = `<div class="alert-strip ${res.error === 'no_key' ? 'warn' : 'danger'}">${res.error === 'no_key' ? '⚠️ No Gemini API key — set it in Settings' : '❌ ' + res.error}</div>`; return; }
    await handleScanResult(res.result, area);
  };

  window.captureStrip = async () => {
    const video = document.getElementById('cam-video');
    const canvas = document.getElementById('cam-canvas');
    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;
    const maxW = 1600;
    const maxH = 1600;
    if (w > maxW || h > maxH) {
      const ratio = Math.min(maxW / w, maxH / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    video.srcObject?.getTracks().forEach(t => t.stop());
    const b64  = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    const area = document.getElementById('camera-area');
    area.innerHTML = '<div class="row" style="justify-content:center;padding:16px"><div class="spinner"></div><span style="color:var(--muted)">Reading with Gemini…</span></div>';
    const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_b64: b64, mime: 'image/jpeg', mode: 'strip' }) }).then(r => r.json());
    if (!res.ok) { area.innerHTML = `<div class="alert-strip ${res.error === 'no_key' ? 'warn' : 'danger'}">${res.error === 'no_key' ? '⚠️ No Gemini API key — set it in backend/routers/scan.py' : '❌ ' + res.error}</div>`; return; }
    await handleScanResult(res.result, area);
  };

  window.handleChallaDrop = (e) => { e.preventDefault(); handleChallaScan(e.dataTransfer.files[0]); };
  window.handleChallaScan = async (file) => {
    if (!file) return;
    const res = document.getElementById('challan-result');
    res.innerHTML = '<div class="row" style="justify-content:center;padding:16px"><div class="spinner"></div><span style="color:var(--muted)">Reading invoice…</span></div>';
    let b64;
    let mime = 'image/jpeg';
    try {
      b64 = await compressImage(file);
    } catch (err) {
      console.error("Compression failed, falling back to raw upload:", err);
      b64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
      mime = file.type || 'image/jpeg';
    }
    const scanRes = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_b64: b64, mime: mime, mode: 'challan' }) }).then(r => r.json());
    if (!scanRes.ok) { res.innerHTML = `<div class="alert-strip ${scanRes.error === 'no_key' ? 'warn' : 'danger'}">${scanRes.error === 'no_key' ? '⚠️ No Gemini key set in backend/routers/scan.py' : '❌ ' + scanRes.error}</div>`; return; }
    
    window._scannedChallanItems = scanRes.result.map(it => ({
      drug_id: null,
      drug_name: it.drug_name || '',
      batch_no: it.batch_no || '',
      expiry: window.normalizeExpiry ? window.normalizeExpiry(it.expiry || '') : (it.expiry || ''),
      strips: it.strips || 1,
      cost: it.cost || 0,
      mrp: it.mrp || 0
    }));

    await checkChallanMatches();
    window.renderChallanItems();
  };

  async function checkChallanMatches() {
    const items = window._scannedChallanItems || [];
    const checkPromises = items.map(async (it) => {
      if (it.drug_id) return;
      try {
        const queryWord = (it.drug_name || '').split(' ')[0];
        if (!queryWord) return;
        const drugs = await GET('/drugs?q=' + encodeURIComponent(queryWord));
        const cleanName = (it.drug_name || '').toLowerCase().trim();
        const match = drugs.find(d => d.name.toLowerCase().trim() === cleanName || d.brand.toLowerCase().trim() === cleanName);
        if (match) {
          it.drug_id = match.id;
          it.drug_name = match.name;
        } else if (drugs.length === 1) {
          it.drug_id = drugs[0].id;
          it.drug_name = drugs[0].name;
        }
      } catch (err) {
        console.error("Match error:", err);
      }
    });
    await Promise.all(checkPromises);
  }

  window.triggerChallanRecheck = async (i) => {
    const it = window._scannedChallanItems[i];
    if (!it) return;
    try {
      const queryWord = (it.drug_name || '').split(' ')[0];
      if (!queryWord) {
        it.drug_id = null;
        window.renderChallanItems();
        return;
      }
      const drugs = await GET('/drugs?q=' + encodeURIComponent(queryWord));
      const cleanName = (it.drug_name || '').toLowerCase().trim();
      const match = drugs.find(d => d.name.toLowerCase().trim() === cleanName || d.brand.toLowerCase().trim() === cleanName);
      if (match) {
        it.drug_id = match.id;
        it.drug_name = match.name;
      } else if (drugs.length === 1) {
        it.drug_id = drugs[0].id;
        it.drug_name = drugs[0].name;
      } else {
        it.drug_id = null;
      }
    } catch (e) {
      console.error(e);
      it.drug_id = null;
    }
    window.renderChallanItems();
  };

  window.renderChallanItems = () => {
    const res = document.getElementById('challan-result');
    const items = window._scannedChallanItems || [];
    if (!items.length) {
      res.innerHTML = '<div class="alert-strip success" style="text-align:center;justify-content:center">🎉 All items added to stock successfully!</div>';
      return;
    }
    
    res.innerHTML = `
      <div class="gap-12">
        <div class="section-title">Gemini found ${items.length} items — verify each below</div>
        ${items.map((it, i) => {
          const hasMatch = !!it.drug_id;
          return `
          <div class="card-sm" style="border-color:${hasMatch ? 'var(--info)33' : 'var(--warn)66'};background:${hasMatch ? 'transparent' : 'var(--accent-dim)'}">
            <div class="field" style="margin-bottom:8px">
              <label style="font-size:9px;color:var(--muted)">Drug Name</label>
              <input class="input" value="${it.drug_name || ''}" id="ch-name-${i}" style="font-weight:700"
                onchange="window._scannedChallanItems[${i}].drug_name = this.value; window.triggerChallanRecheck(${i})">
            </div>
            
            <div class="grid-2" style="gap:8px;margin-bottom:8px">
              <div class="field"><label>Batch</label><input class="input" value="${it.batch_no || ''}" id="ch-batch-${i}" onchange="window._scannedChallanItems[${i}].batch_no = this.value"></div>
              <div class="field"><label>Expiry</label><input class="input" type="month" value="${it.expiry || ''}" id="ch-exp-${i}" onchange="window._scannedChallanItems[${i}].expiry = this.value"></div>
            </div>
            
            <div class="grid-3" style="gap:8px;margin-bottom:8px">
              <div class="field"><label>Strips</label><input class="input" type="number" value="${it.strips || 1}" id="ch-strips-${i}" min="1" onchange="window._scannedChallanItems[${i}].strips = parseInt(this.value) || 0"></div>
              <div class="field"><label>Cost/Strip (₹)</label><input class="input" type="number" step="0.01" value="${it.cost || 0}" id="ch-cost-${i}" min="0" onchange="window._scannedChallanItems[${i}].cost = parseFloat(this.value) || 0"></div>
              <div class="field"><label>MRP/Strip (₹)</label><input class="input" type="number" step="0.01" value="${it.mrp || 0}" id="ch-mrp-${i}" min="0" onchange="window._scannedChallanItems[${i}].mrp = parseFloat(this.value) || 0"></div>
            </div>
            
            <div style="margin-top:10px">
              ${hasMatch ? 
                `<button class="btn btn-primary btn-sm" style="width:100%" onclick="confirmChallItem(${i})">✅ Add to Stock</button>` :
                `<div style="display:flex;gap:8px">
                   <button class="btn btn-warn btn-sm" style="flex:1" onclick="addChallItemToCatalogue(${i})">➕ Add to Master Directory</button>
                   <button class="btn btn-secondary btn-sm" onclick="window.triggerChallanRecheck(${i})">🔄 Re-check</button>
                 </div>`
              }
            </div>
          </div>`;
        }).join('')}
      </div>`;
  };

  window.addChallItemToCatalogue = (i) => {
    const it = window._scannedChallanItems[i];
    window._onDrugAdded = async (newDrug) => {
      it.drug_id = newDrug.id;
      it.drug_name = newDrug.name;
      toast(`${newDrug.name} added to master catalogue ✅`, 'success');
      window.renderChallanItems();
    };
    window.showAddDrug({
      name: it.drug_name,
      batch: it.batch_no,
      expiry: it.expiry,
      mrps: it.mrp,
      qty: it.strips
    });
  };

  window.confirmChallItem = async (i) => {
    const it = window._scannedChallanItems[i];
    if (!it || !it.drug_id) {
      toast("Please add the item to the master directory first.", "error");
      return;
    }
    
    // Read current form values from UI in case user edited them without triggering change
    const batch_no = document.getElementById('ch-batch-' + i)?.value || 'NA';
    const expiry   = document.getElementById('ch-exp-' + i)?.value || '';
    const strips   = parseInt(document.getElementById('ch-strips-' + i)?.value || 1);
    const cost_per_strip = parseFloat(document.getElementById('ch-cost-' + i)?.value || 0);
    const mrp_per_strip  = parseFloat(document.getElementById('ch-mrp-' + i)?.value || 0);

    if (!expiry) { toast('Expiry required', 'warn'); return; }

    try {
      await POST('/batches', {
        drug_id: it.drug_id,
        batch_no: batch_no,
        expiry: expiry,
        strips: strips,
        cost_per_strip: cost_per_strip,
        mrp_per_strip: mrp_per_strip
      });
      
      added.push({ drug_name: it.drug_name, strips, expiry });
      toast(`${it.drug_name} · ${strips} strips added ✅`, 'success');
      
      // Remove from scanned items list since it's successfully placed/added to inventory
      window._scannedChallanItems.splice(i, 1);
      window.renderChallanItems();
      
      // Update the underlying page state rendering if visible
      c.innerHTML = html();
    } catch (err) {
      console.error(err);
      toast("Failed to add stock batch: " + err.message, "error");
    }
  };
}
