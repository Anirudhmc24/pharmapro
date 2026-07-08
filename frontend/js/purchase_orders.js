// purchase_orders.js — Purchase Orders (industry-standard full-page flow)
import { GET, POST, PUT, DELETE } from './api.js';
import { fmt, fmtI, tag, formatDate, toast, modal, closeModal } from './utils.js';

export async function renderPurchaseOrders(c, APP) {
  let view = 'list'; // 'list' | 'create'
  let pos  = [];

  // ── PO List ──────────────────────────────────────────────────
  async function renderList() {
    view = 'list';
    pos  = await GET('/purchase_orders');
    const statusTag = (s) => ({
      draft:    tag('Draft', 'tag-gray'),
      ordered:  tag('Ordered', 'tag-amber'),
      received: tag('Received', 'tag-green'),
    }[s] || tag(s, 'tag-gray'));

    c.innerHTML = `<div class="gap-16 fade-in">
      <div class="flex-between">
        <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Purchase Orders</h2>
          <div style="color:var(--muted);font-size:12px">${pos.length} orders · Track all supplier orders</div></div>
        <button class="btn btn-primary btn-sm" onclick="window._renderCreatePO()">+ New PO</button>
      </div>
      ${pos.length === 0 ? `<div class="card" style="text-align:center;padding:48px">
        <div style="font-size:48px;margin-bottom:12px">📋</div>
        <div style="font-weight:700;color:var(--text);margin-bottom:6px">No purchase orders yet</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:16px">Create a PO to order stock from your suppliers</div>
        <button class="btn btn-primary" onclick="window._renderCreatePO()">Create First PO</button>
      </div>` : `
      <div class="card" style="padding:0;overflow:auto">
        <table class="tbl">
          <thead><tr><th>PO #</th><th>Supplier</th><th>Items</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>${pos.map(po => `<tr>
            <td style="font-family:monospace;font-weight:700;color:var(--accent)">${po.po_no}</td>
            <td style="font-weight:600">${po.supplier_name || '<span style="color:var(--muted)">—</span>'}</td>
            <td style="color:var(--muted)">${po.item_count || 0} items</td>
            <td style="font-weight:700">${fmtI(po.total_amt || 0)}</td>
            <td>${statusTag(po.status)}</td>
            <td style="font-size:12px;color:var(--muted)">${formatDate(po.created_at)}</td>
            <td style="display:flex;gap:6px;align-items:center">
              <button class="btn btn-outline btn-sm" onclick="viewPO(${po.id})">View</button>
              ${po.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="sendPO(${po.id})">Send →</button>` : ''}
              ${po.status === 'ordered' ? `<button class="btn btn-primary btn-sm" style="background:var(--green)" onclick="receivePO(${po.id})">Receive</button>` : ''}
              ${po.status !== 'received' ? `<button class="btn btn-danger btn-sm" onclick="deletePO(${po.id})">✕</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="printPO(${po.id})">🖨️</button>
            </td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;
    bindListHandlers();
  }

  // ── Create PO (full-page) ────────────────────────────────────
  async function renderCreatePO() {
    view = 'create';
    const [sups, drugs] = await Promise.all([GET('/suppliers'), GET('/drugs')]);

    // ── Feature 1: Check for preloaded drugs from dashboard reorder panel
    const preload = JSON.parse(sessionStorage.getItem('po_preload') || 'null');
    sessionStorage.removeItem('po_preload');

    // State
    let selectedSup   = null;
    let lastRateCache = {}; // drug_id → {rate, discount_pct, gst_pct}
    let poLines       = [];
    const GST_RATES   = [0, 5, 12, 18];

    window._stockDrugsCache = {};
    drugs.forEach(d => window._stockDrugsCache[d.id] = d);

    // ── Feature 1: Pre-populate lines from reorder preload
    if (preload?.length) {
      preload.forEach(p => {
        const d = window._stockDrugsCache[p.drug_id];
        if (d) {
          poLines.push({
            type: 'catalogue', drug_id: p.drug_id, name: d.name, brand: d.brand || '',
            qty: p.strips || 1, rate: p.rate || d.mrp_per_strip || 0,
            disc: 0, gst: parseInt(APP.config.gst_slab || 12),
          });
        }
      });
    }

    function totalLine(l) {
      const sub  = l.qty * l.rate;
      const disc = sub * (l.disc / 100);
      const gst  = (sub - disc) * (l.gst / 100);
      return sub - disc + gst;
    }

    function grandTotal() { return poLines.reduce((a, l) => a + totalLine(l), 0); }

    function lineHTML(l, i) {
      return `<div class="po-line" id="pol-${i}" style="background:var(--subtle);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div style="font-weight:800;color:var(--text)">${l.name}</div>
            <div style="font-size:11px;color:var(--muted)">${l.type === 'manual' ? '⚠️ New drug (not in catalogue)' : l.brand ? l.brand : ''}</div>
          </div>
          <button onclick="removeLine(${i})" style="background:none;border:none;color:var(--danger);font-size:18px;cursor:pointer;padding:0 4px">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;align-items:end">
          <div class="field"><label>Strips ordered *</label>
            <input class="input" type="number" value="${l.qty}" min="1" oninput="updateLine(${i},'qty',this.value)" style="text-align:center"></div>
          <div class="field"><label>Rate/strip (₹) *</label>
            <input class="input" type="number" value="${l.rate}" min="0" step="0.5" oninput="updateLine(${i},'rate',this.value)"></div>
          <div class="field"><label>Discount %</label>
            <input class="input" type="number" value="${l.disc}" min="0" max="100" step="0.5" oninput="updateLine(${i},'disc',this.value)"></div>
          <div class="field"><label>GST %</label>
            <select class="select" onchange="updateLine(${i},'gst',this.value)">
              ${GST_RATES.map(g => `<option value="${g}" ${l.gst === g ? 'selected' : ''}>${g}%</option>`).join('')}
            </select></div>
          <div class="field"><label style="color:var(--accent)">Line Total</label>
            <div id="pol-total-${i}" style="font-size:16px;font-weight:900;color:var(--accent);padding:9px 0">${fmtI(totalLine(l))}</div>
          </div>
        </div>
      </div>`;
    }

    function supCardHTML() {
      if (!selectedSup) return `<div style="color:var(--muted);font-size:12px;padding:8px 0">No supplier selected — PO will be saved without supplier</div>`;
      return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div><span style="color:var(--muted)">Contact:</span> <b>${selectedSup.contact || '—'}</b></div>
        <div><span style="color:var(--muted)">Phone:</span> <b>${selectedSup.phone || '—'}</b></div>
        <div><span style="color:var(--muted)">GSTIN:</span> <b>${selectedSup.gstin || '—'}</b></div>
        <div><span style="color:var(--muted)">Due:</span> <b style="color:${(selectedSup.due||0)>0?'var(--warn)':'var(--green)'}">₹${(selectedSup.due||0).toLocaleString('en-IN')}</b></div>
      </div>`;
    }

    function renderLines() {
      document.getElementById('po-lines').innerHTML = poLines.length
        ? poLines.map((l, i) => lineHTML(l, i)).join('')
        : `<div style="color:var(--muted);text-align:center;padding:24px;border:2px dashed var(--border);border-radius:12px">No items added yet — search and add medicines below</div>`;
      document.getElementById('po-grand-total').textContent = fmtI(grandTotal());
      document.getElementById('po-item-count').textContent  = poLines.length + ' item' + (poLines.length !== 1 ? 's' : '');
    }

    c.innerHTML = `<div class="gap-16 fade-in">
      <!-- Header -->
      <div class="flex-between">
        <div>
          <button onclick="window._renderList()" style="background:none;border:none;color:var(--muted);font-size:13px;cursor:pointer;padding:0;margin-bottom:4px">← Back to POs</button>
          <h2 style="font-size:18px;font-weight:800">New Purchase Order</h2>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" onclick="savePODraft()">Save Draft</button>
          <button class="btn btn-primary" onclick="savePOAndSend()">Save & Send →</button>
        </div>
      </div>

      <!-- 2-column top section -->
      <div class="grid-2">
        <!-- Supplier Panel -->
        <div class="card">
          <div class="section-title">Supplier</div>
          <div class="field" style="margin-bottom:12px">
            <label>Select Supplier</label>
            <select class="select" id="po-sup-sel" onchange="onSupChange(this.value)">
              <option value="">— No supplier —</option>
              ${sups.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
          </div>
          <div id="sup-card">${supCardHTML()}</div>
          <div style="margin-top:10px;font-size:11px;color:var(--muted)">
            Don't see your supplier? <button style="background:none;border:none;color:var(--accent);font-size:11px;cursor:pointer;padding:0" onclick="APP.navigate('suppliers')">Add supplier first →</button>
          </div>
        </div>

        <!-- PO Meta -->
        <div class="card">
          <div class="section-title">Order Details</div>
          <div class="grid-2">
            <div class="field"><label>PO Date</label>
              <input class="input" type="date" id="po-date" value="${new Date().toISOString().slice(0,10)}"></div>
            <div class="field"><label>Expected Delivery</label>
              <input class="input" type="date" id="po-dlv"></div>
          </div>
          <div class="field" style="margin-top:10px"><label>Notes / Remarks</label>
            <textarea class="input" id="po-notes" rows="2" placeholder="e.g. Urgent order, deliver by end of month"></textarea></div>
        </div>
      </div>

      <!-- Drug search -->
      <div class="card">
        <div class="section-title">Add Medicines to Order</div>
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div class="search-wrap" style="flex:1">
            <span class="search-icon">🔍</span>
            <input class="input" id="po-drug-search" placeholder="Search medicine by name or brand…" oninput="poDrugSearch(this.value)" autocomplete="off">
            <div class="search-drop" id="po-drug-drop" style="display:none"></div>
          </div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--muted)">
          Not finding a medicine? Type its name and click <b style="color:var(--accent)">"+ Add as new drug request"</b> at the bottom of the dropdown.
        </div>
      </div>

      <!-- Lines -->
      <div class="card">
        <div class="flex-between" style="margin-bottom:12px">
          <div class="section-title" style="margin:0">Order Lines <span id="po-item-count" style="color:var(--muted);font-size:11px;margin-left:6px">0 items</span></div>
          <div style="font-size:13px;color:var(--muted)">Total: <span id="po-grand-total" style="color:var(--accent);font-weight:900;font-size:16px">₹0</span></div>
        </div>
        <div id="po-lines"></div>
      </div>

      <!-- Summary bottom bar -->
      <div class="card" style="padding:16px 20px">
        <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
          <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Items</div>
            <div id="po-grand-items" style="font-weight:800;font-size:18px">0</div></div>
          <div style="flex:1"></div>
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Grand Total</div>
            <div id="po-grand-total2" style="font-weight:900;font-size:24px;color:var(--accent)">₹0</div>
          </div>
          <button class="btn btn-outline" onclick="savePODraft()">💾 Save Draft</button>
          <button class="btn btn-primary" style="padding:12px 24px" onclick="savePOAndSend()">Send to Supplier →</button>
        </div>
      </div>
    </div>`;

    // Render empty lines list
    renderLines();

    // ── Supplier change → show details + Feature 2: fetch last rates
    window.onSupChange = async (id) => {
      selectedSup = sups.find(s => s.id == id) || null;
      document.getElementById('sup-card').innerHTML = supCardHTML();

      // Feature 2: auto-fill last purchase rates
      if (id) {
        try {
          const rates = await GET('/purchase_orders/last-rates/' + id);
          lastRateCache = {};
          rates.forEach(r => lastRateCache[r.drug_id] = r);

          // Update existing lines that have a known last rate
          let updated = 0;
          poLines.forEach(l => {
            const lr = lastRateCache[l.drug_id];
            if (lr) {
              l.rate = lr.rate_per_strip;
              l.disc = lr.discount_pct || 0;
              l.gst  = lr.gst_pct || 0;
              updated++;
            }
          });
          if (updated > 0) {
            renderLines();
            toast(`↩️ ${updated} line${updated > 1 ? 's' : ''} updated with last purchase rate`, 'info');
          }
        } catch (_) { /* no prior POs — no-op */ }
      }
    };

    // ── Drug search with manual fallback
    window.poDrugSearch = (q) => {
      const drop = document.getElementById('po-drug-drop');
      if (q.length < 1) { drop.style.display = 'none'; return; }
      const matches = drugs.filter(d =>
        d.name.toLowerCase().includes(q.toLowerCase()) ||
        (d.brand || '').toLowerCase().includes(q.toLowerCase())
      ).slice(0, 8);

      const items = matches.map(d => `
        <div class="search-item" onclick="poAddDrug(${d.id})">
          <div><div style="font-weight:700">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.brand || ''} · ${d.tablets_per_strip || 10} items/pack</div></div>
          <div style="color:var(--accent);font-size:12px;font-weight:700">₹${d.mrp_per_strip || 0}/pack</div>
        </div>`);

      // Always show "add new drug request" option
      const escaped = q.replace(/'/g, "\\'");
      items.push(`<div class="search-item" style="color:var(--accent);border-top:1px solid var(--border)" onclick="poAddManualDrug('${escaped}')">
        <div>➕ <b>Request new drug: "${q}"</b></div>
        <div style="font-size:11px;color:var(--muted)">Add as free-text item in this PO</div>
      </div>`);

      drop.innerHTML = items.join('');
      drop.style.display = 'block';
    };

    window.poAddDrug = (id) => {
      const d = window._stockDrugsCache?.[id];
      if (!d) return;
      document.getElementById('po-drug-drop').style.display = 'none';
      document.getElementById('po-drug-search').value = '';
      const existing = poLines.findIndex(l => l.type === 'catalogue' && l.drug_id === id);
      // Feature 2: use last rate if supplier already selected
      const lr = lastRateCache[id];
      if (existing >= 0) { poLines[existing].qty += 1; }
      else {
        poLines.push({
          type: 'catalogue', drug_id: id, name: d.name, brand: d.brand || '',
          qty: 1,
          rate: lr ? lr.rate_per_strip : (d.mrp_per_strip || 0),
          disc: lr ? (lr.discount_pct || 0) : 0,
          gst:  lr ? (lr.gst_pct   || 0) : parseInt(APP.config.gst_slab || 12),
        });
        if (lr) toast(`↩️ Rate auto-filled from last PO with this supplier`, 'info');
      }
      renderLines();
      updateSummaryBar();
    };

    window.poAddManualDrug = (name) => {
      document.getElementById('po-drug-drop').style.display = 'none';
      document.getElementById('po-drug-search').value = '';
      poLines.push({ type: 'manual', drug_id: null, name: name, brand: '',
        qty: 1, rate: 0, disc: 0, gst: 12 });
      renderLines();
      updateSummaryBar();
    };

    window.removeLine = (i) => {
      poLines.splice(i, 1);
      renderLines();
      updateSummaryBar();
    };

    window.updateLine = (i, field, val) => {
      if (field === 'qty'  ) poLines[i].qty  = parseInt(val)   || 0;
      if (field === 'rate' ) poLines[i].rate = parseFloat(val) || 0;
      if (field === 'disc' ) poLines[i].disc = parseFloat(val) || 0;
      if (field === 'gst'  ) poLines[i].gst  = parseInt(val)   || 0;
      const el = document.getElementById(`pol-total-${i}`);
      if (el) el.textContent = fmtI(totalLine(poLines[i]));
      document.getElementById('po-grand-total').textContent = fmtI(grandTotal());
      updateSummaryBar();
    };

    function updateSummaryBar() {
      const t = document.getElementById('po-grand-total2');
      const n = document.getElementById('po-grand-items');
      if (t) t.textContent = fmtI(grandTotal());
      if (n) n.textContent = poLines.length;
    }

    // ── Save helpers
    async function buildAndSave(andSend = false) {
      if (!poLines.length) { 
        toast('Add at least one medicine to the order', 'warn'); 
        return; 
      }
      const catalogueLines = poLines.filter(l => l.type === 'catalogue');
      const manualLines    = poLines.filter(l => l.type === 'manual');

      if (catalogueLines.length === 0 && manualLines.length > 0) {
        toast('All items are new drugs. Add them to the catalogue first, then create the PO.', 'warn');
        return;
      }

      const items = catalogueLines.map(l => ({
        drug_id:        l.drug_id,
        qty_strips:     l.qty,
        rate_per_strip: l.rate,
        discount_pct:   l.disc,
        gst_pct:        l.gst,
      }));

      const notes = [
        document.getElementById('po-notes')?.value || '',
        manualLines.length ? `\n[Requested new drugs — not yet in catalogue]:\n${manualLines.map(l => `• ${l.name} (${l.qty} strips @ ₹${l.rate})`).join('\n')}` : ''
      ].join('').trim();

      try {
        const res = await POST('/purchase_orders', {
          supplier_id: parseInt(document.getElementById('po-sup-sel')?.value) || null,
          notes,
          items,
        });

        if (andSend) {
          if (window.sendPO) {
            await window.sendPO(res.po_id);
          } else {
            await PUT('/purchase_orders/' + res.po_id + '/send');
            toast(`PO ${res.po_no} created & sent ✅`, 'success');
            renderList();
          }
        } else {
          toast(`PO ${res.po_no} saved as draft ✅`, 'success');
          renderList();
        }
      } catch (err) {
        // error handled by POST
      }
    }

    window.savePODraft    = () => buildAndSave(false);
    window.savePOAndSend  = () => buildAndSave(true);
  }

  // ── View / Receive / Delete handlers ─────────────────────────
  function bindListHandlers() {
    window.viewPO = async (id) => {
      const po = await GET('/purchase_orders/' + id);
      const statusTag = (s) => ({ draft: tag('Draft','tag-gray'), ordered: tag('Ordered','tag-amber'), received: tag('Received','tag-green') })[s] || tag(s,'tag-gray');
      modal(`📋 ${po.po_no}`, `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;font-size:13px">
          <div><span style="color:var(--muted)">Supplier:</span> <b>${po.supplier_name || '—'}</b></div>
          <div>·</div><div>Status: ${statusTag(po.status)}</div>
          <div>·</div><div style="color:var(--muted)">${formatDate(po.created_at)}</div>
        </div>
        ${po.notes ? `<div class="alert-strip info" style="margin-bottom:12px">${po.notes}</div>` : ''}
        <table class="tbl"><thead><tr><th>Drug</th><th>Ordered</th><th>Received</th><th>Rate</th><th>Disc%</th><th>GST%</th><th>Amount</th></tr></thead>
        <tbody>${po.items.map(it => `<tr>
          <td><div style="font-weight:700">${it.drug_name}</div><div style="font-size:11px;color:var(--muted)">${it.brand || ''}</div></td>
          <td>${it.qty_strips} strips</td>
          <td style="color:${it.received_strips > 0 ? 'var(--green)' : 'var(--muted)'}">${it.received_strips || '—'}</td>
          <td>${fmt(it.rate_per_strip)}</td>
          <td style="color:var(--muted)">${it.discount_pct || 0}%</td>
          <td style="color:var(--muted)">${it.gst_pct || 0}%</td>
          <td style="font-weight:700">${fmtI(it.qty_strips * it.rate_per_strip * (1 - (it.discount_pct||0)/100) * (1 + (it.gst_pct||0)/100))}</td>
        </tr>`).join('')}</tbody></table>
        <div class="flex-between" style="margin-top:12px;font-size:16px;font-weight:900;border-top:1px solid var(--border);padding-top:10px">
          <span>Grand Total</span><span style="color:var(--accent)">${fmtI(po.total_amt || 0)}</span>
        </div>`,
        `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Close</button>
         ${po.status === 'draft' ? `<button class="btn btn-outline" style="flex:1" onclick="closeModal();printPO(${id})">🖨️ Print</button>` : ''}
         ${po.status === 'ordered' ? `<button class="btn btn-primary" style="flex:1" onclick="closeModal();receivePO(${id})">📦 Receive Stock →</button>` : ''}`
      );
    };

    window.sendPO = async (id) => {
      try {
        const po = await GET('/purchase_orders/' + id);
        await PUT('/purchase_orders/' + id + '/send');
        
        let msg = `*Purchase Order: ${po.po_no}*\n\n`;
        msg += `Please process the following order:\n`;
        po.items.forEach((it, idx) => {
          msg += `${idx + 1}. *${it.drug_name}* - ${it.qty_strips} strips\n`;
        });
        if (po.notes) msg += `\n*Notes*: ${po.notes}\n`;
        
        if (po.supplier_phone) {
          let phone = po.supplier_phone.replace(/\D/g, '');
          if (phone.length === 10) phone = '91' + phone;
          
          modal(`🚀 Send to ${po.supplier_name}`, `
            <div style="text-align:center;padding:20px 0">
              <div style="font-size:48px;margin-bottom:12px">💬</div>
              <div style="font-weight:700;font-size:16px;margin-bottom:8px">Order saved successfully!</div>
              <div style="color:var(--muted);font-size:13px">Click below to send this PO via WhatsApp.</div>
            </div>`,
            `<button class="btn btn-outline" style="flex:1" onclick="closeModal(); window._renderList()">Skip</button>
             <button class="btn btn-primary" style="flex:2;background:#25d366;color:white;border:none" onclick="window.sendPoWhatsapp('${phone}', '${msg.replace(/'/g, "\\'")}')">Send via WhatsApp →</button>`
          );
        } else {
          toast('PO sent internally. No supplier phone found.', 'success');
          renderList();
        }
      } catch (err) {
        toast('Error sending PO', 'error');
      }
    };

    window.printPO = async (id) => {
      const po = await GET('/purchase_orders/' + id);
      const w = window.open('', '_blank', 'width=780,height=900');
      const rows = po.items.map(it => {
        const disc = it.discount_pct || 0;
        const gst  = it.gst_pct || 0;
        const amt  = it.qty_strips * it.rate_per_strip * (1 - disc/100) * (1 + gst/100);
        return `<tr><td>${it.drug_name}<br><small style="color:#777">${it.brand || ''}</small></td>
          <td style="text-align:center">${it.qty_strips}</td>
          <td style="text-align:right">₹${it.rate_per_strip.toFixed(2)}</td>
          <td style="text-align:center">${disc}%</td>
          <td style="text-align:center">${gst}%</td>
          <td style="text-align:right;font-weight:700">₹${amt.toFixed(2)}</td></tr>`;
      }).join('');
      w.document.write(`<html><head><title>${po.po_no}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;font-size:13px}
          h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
          th{background:#f5f5f5;padding:8px;text-align:left;border:1px solid #ddd}
          td{padding:8px;border:1px solid #ddd}
          .hdr{display:flex;justify-content:space-between;margin-bottom:16px}
          .total{font-size:18px;font-weight:700;text-align:right;margin-top:12px}
          .lbl{color:#666;font-size:11px}
          .no-print { display: block; }
          @media print {
            .no-print { display: none !important; }
          }
        </style></head><body>
        <div class="no-print" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;font-family:sans-serif;margin-bottom:20px;">
          <button onclick="window.history.back() || (window.location.href='/')" style="padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">← Back to App</button>
          <span style="font-size:12px;color:#475569;font-weight:600">Print page loaded.</span>
          <button onclick="window.close()" style="padding:8px 16px;background:#ef4444;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">Close Tab ✕</button>
        </div>
        <div class="hdr">
          <div><h1>Purchase Order</h1><div class="lbl">PO Number</div><div style="font-weight:700;font-size:15px">${po.po_no}</div></div>
          <div style="text-align:right">
            <div class="lbl">Date</div><div style="font-weight:700">${new Date().toLocaleDateString('en-IN')}</div>
            <div class="lbl" style="margin-top:8px">Status</div><div style="font-weight:700">${po.status.toUpperCase()}</div>
          </div>
        </div>
        ${po.supplier_name ? `<div style="margin-bottom:16px"><div class="lbl">Supplier</div><div style="font-weight:700;font-size:15px">${po.supplier_name}</div></div>` : ''}
        ${po.notes ? `<div style="background:#f9f9f9;border:1px solid #ddd;padding:10px;border-radius:6px;margin-bottom:16px;font-size:12px">${po.notes}</div>` : ''}
        <table><thead><tr><th>Medicine</th><th style="text-align:center">Strips</th><th style="text-align:right">Rate</th><th style="text-align:center">Disc%</th><th style="text-align:center">GST%</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <div class="total">Grand Total: ₹${(po.total_amt || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
        <div style="margin-top:24px;font-size:11px;color:#999;text-align:center">Generated by PharmaPro · ${new Date().toLocaleString('en-IN')}</div>
        <script>window.print();window.close();<\/script></body></html>`);
    };

    window.receivePO = async (po_id) => {
      const po = await GET('/purchase_orders/' + po_id);
      // Only show items not yet fully received
      const pending = po.items.filter(it => !(it.received_strips > 0));
      const already = po.items.filter(it =>  it.received_strips > 0);
      const itemsHtml = pending.map((it, i) => `
        <div class="card-sm" style="border-color:var(--info)33;margin-bottom:10px" id="rcv-card-${i}">
          <div class="flex-between" style="margin-bottom:8px">
            <div>
              <div style="font-weight:700">${it.drug_name}</div>
              <div style="font-size:11px;color:var(--muted)">Ordered: ${it.qty_strips} strips · ₹${it.rate_per_strip}/strip</div>
            </div>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">
              <input type="checkbox" id="rc-include-${i}" checked onchange="toggleRcvCard(${i})" style="accent-color:var(--accent)">
              <span>Received</span>
            </label>
          </div>
          <div class="grid-2" style="gap:8px" id="rc-fields-${i}">
            <div class="field"><label>Qty Received</label><input class="input" type="number" id="rc-qty-${i}" value="${it.qty_strips}" min="0"></div>
            <div class="field"><label>Cost/Pack ₹</label><input class="input" type="number" id="rc-cost-${i}" value="${it.rate_per_strip || 0}" step="0.5"></div>
            <div class="field"><label>Batch No. *</label><input class="input" id="rc-batch-${i}" placeholder="e.g. B25-001"></div>
            <div class="field"><label>Expiry *</label><input class="input" type="month" id="rc-exp-${i}"></div>
          </div>
          <input type="hidden" id="rc-pi-id-${i}" value="${it.id}">
        </div>`);

      if (already.length) {
        itemsHtml.push(`<div class="alert-strip info" style="margin-top:12px">
          ✅ Already received: ${already.map(it => `<b>${it.drug_name}</b> (${it.received_strips} strips)`).join(', ')}
        </div>`);
      }

      modal('📦 Receive Stock — ' + po.po_no,
        `<div class="alert-strip info" style="margin-bottom:12px">
          Uncheck any item not delivered yet — it stays pending for the next delivery.
        </div>${itemsHtml.join('')}`,
        `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
         <button class="btn btn-primary" style="flex:1" onclick="confirmReceive(${po_id},${pending.length})">✅ Receive Selected</button>`
      );

      window.toggleRcvCard = (i) => {
        const included = document.getElementById(`rc-include-${i}`)?.checked;
        const fields   = document.getElementById(`rc-fields-${i}`);
        if (fields) fields.style.opacity = included ? '1' : '0.3';
      };
    };

    window.confirmReceive = async (po_id, count) => {
      const items = [];
      for (let i = 0; i < count; i++) {
        const included = document.getElementById(`rc-include-${i}`)?.checked;
        if (!included) continue;   // Feature 3: skip unchecked items
        const batch = document.getElementById(`rc-batch-${i}`)?.value?.trim();
        const exp   = document.getElementById(`rc-exp-${i}`)?.value;
        if (!batch || !exp) { toast(`Batch & expiry required for item ${i+1}`, 'warn'); return; }
        items.push({
          po_item_id:      parseInt(document.getElementById(`rc-pi-id-${i}`)?.value),
          received_strips: parseInt(document.getElementById(`rc-qty-${i}`)?.value || 0),
          batch_no: batch, expiry: exp,
          cost_per_strip: parseFloat(document.getElementById(`rc-cost-${i}`)?.value || 0),
        });
      }
      if (!items.length) { toast('Select at least one item to receive', 'warn'); return; }

      // Use partial-receive so un-checked items keep the PO open
      const res = await POST('/purchase_orders/' + po_id + '/partial-receive', { items });
      closeModal();
      if (res.still_pending > 0) {
        toast(`${items.length} item(s) added to stock. ${res.still_pending} still pending — PO stays open.`, 'success');
      } else {
        toast('All items received — PO marked as complete ✅', 'success');
      }
      renderList();
    };

    window.deletePO = async (id) => {
      if (!confirm('Delete this PO?')) return;
      await DELETE('/purchase_orders/' + id);
      toast('PO deleted', 'success');
      renderList();
    };
  }

  // ── Expose navigation globally ────────────────────────────────
  window._renderList    = renderList;
  window._renderCreatePO = renderCreatePO;

  window.sendPoWhatsapp = (phone, msg) => {
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    if (window.AndroidBridge && window.AndroidBridge.openExternalUrl) {
      window.AndroidBridge.openExternalUrl(waUrl);
    } else {
      window.open(waUrl, '_blank');
    }
  };

  // ── Boot ─────────────────────────────────────────────────────
  await renderList();
}
