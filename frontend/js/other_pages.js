// customers.js — Customer list and purchase history
import { GET, POST } from './api.js';
import { tag, toast, modal, closeModal, formatDate } from './utils.js';

export async function renderCustomers(c, APP) {
  let custs = await GET('/customers');

  function html() {
    return `<div class="gap-16 fade-in">
      <div class="flex-between">
        <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Customers</h2>
          <div style="color:var(--muted);font-size:12px">${custs.length} registered</div></div>
        <button class="btn btn-primary btn-sm" onclick="showAddCustomer()">+ Add Customer</button>
      </div>
      ${custs.length === 0 ? '<div class="card" style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:48px;margin-bottom:12px">👥</div>No customers yet</div>' : `
      <div class="card" style="padding:0;overflow:auto">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Phone</th><th>Loyalty</th><th>Joined</th><th></th></tr></thead>
          <tbody>${custs.map(cu => `<tr>
            <td style="font-weight:700">${cu.name}</td>
            <td style="color:var(--muted)">${cu.phone || '—'}</td>
            <td><span style="color:var(--accent);font-weight:800">${cu.loyalty_points || 0}</span> <span style="color:var(--muted);font-size:11px">pts</span></td>
            <td style="font-size:11px;color:var(--muted)">${formatDate(cu.created_at)}</td>
            <td><button class="btn btn-outline btn-sm" onclick="viewCustomerHistory(${cu.id},'${cu.name.replace(/'/g,"\\'")}')">History</button></td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;
  }
  c.innerHTML = html();

  window.showAddCustomer = () => {
    modal('👤 Add Customer', `
      <div class="field"><label>Full Name *</label><input class="input" id="ac-name" placeholder="Patient name"></div>
      <div class="field"><label>Phone</label><input class="input" id="ac-phone" placeholder="Mobile number" type="tel"></div>
      <div class="field"><label>Date of Birth</label><input class="input" type="date" id="ac-dob"></div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="saveCustomer()">Add Customer</button>`
    );
  };

  window.saveCustomer = async () => {
    const name = document.getElementById('ac-name')?.value?.trim();
    if (!name) { toast('Name required', 'warn'); return; }
    await POST('/customers', { name, phone: document.getElementById('ac-phone')?.value || '', dob: document.getElementById('ac-dob')?.value || '' });
    closeModal(); toast('Customer added ✅', 'success');
    custs = await GET('/customers'); c.innerHTML = html();
  };

  window.viewCustomerHistory = async (id, name) => {
    const bills = await GET('/customers/' + id + '/bills');
    modal(`🧾 ${name} — Purchase History`,
      bills.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--muted)">No purchases yet</div>' : `
      <table class="tbl"><thead><tr><th>Bill No.</th><th>Items</th><th>Amount</th><th>Payment</th><th>Date</th></tr></thead>
      <tbody>${bills.map(b => `<tr>
        <td style="font-family:monospace;font-weight:700;color:var(--accent)">${b.bill_no}</td>
        <td style="color:var(--muted)">${b.item_count}</td>
        <td style="font-weight:700">₹${b.total?.toFixed(2) || '0'}</td>
        <td><span class="tag tag-gray">${b.payment_mode}</span></td>
        <td style="font-size:12px;color:var(--muted)">${formatDate(b.created_at)}</td>
      </tr>`).join('')}</tbody></table>`,
      `<button class="btn btn-outline" style="width:100%" onclick="closeModal()">Close</button>`
    );
  };
}

// suppliers.js — Supplier list
export async function renderSuppliers(c, APP) {
  const { GET: _GET, POST: _POST } = await import('./api.js');
  const { toast: _toast, modal: _modal, closeModal: _close } = await import('./utils.js');
  let sups = await _GET('/suppliers');

  function html() {
    return `<div class="gap-16 fade-in">
      <div class="flex-between">
        <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Suppliers</h2>
          <div style="color:var(--muted);font-size:12px">${sups.length} suppliers</div></div>
        <button class="btn btn-primary btn-sm" onclick="showAddSupplier()">+ Add Supplier</button>
      </div>
      ${sups.length === 0 ? '<div class="card" style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:48px;margin-bottom:12px">🏭</div>No suppliers yet</div>' : `
      <div class="gap-12">${sups.map(s => `<div class="card">
        <div class="flex-between">
          <div><div style="font-weight:800;font-size:15px;margin-bottom:4px">${s.name}</div>
            <div style="color:var(--muted);font-size:12px">👤 ${s.contact || '—'} · 📱 ${s.phone || '—'} · GST: ${s.gstin || '—'}</div></div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:900;color:${(s.due || 0) > 0 ? 'var(--warn)' : 'var(--green)'}">₹${(s.due || 0).toLocaleString('en-IN')}</div>
            <div style="font-size:10px;color:var(--muted)">Amount Due</div>
            <div style="margin-top:6px">
              ${(s.due || 0) > 0 ? `<button class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:10px" onclick="showPaySupplier(${s.id}, '${s.name}', ${s.due})">💳 Pay Balance</button>` : `<span class="tag tag-green">Settled</span>`}
            </div>
          </div>
        </div>
      </div>`).join('')}</div>`}
    </div>`;
  }
  c.innerHTML = html();

  window.showAddSupplier = () => {
    _modal('🏭 Add Supplier', `
      <div class="field"><label>Company Name *</label><input class="input" id="as-name" placeholder="Supplier company"></div>
      <div class="field"><label>Contact Person</label><input class="input" id="as-contact" placeholder="Name"></div>
      <div class="grid-2">
        <div class="field"><label>Phone</label><input class="input" id="as-phone" type="tel"></div>
        <div class="field"><label>GSTIN</label><input class="input" id="as-gstin" placeholder="GST Number"></div>
      </div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="saveSupplier()">Add</button>`
    );
  };

  window.saveSupplier = async () => {
    const name = document.getElementById('as-name')?.value?.trim();
    if (!name) { _toast('Name required', 'warn'); return; }
    await _POST('/suppliers', { name, contact: document.getElementById('as-contact')?.value || '', phone: document.getElementById('as-phone')?.value || '', gstin: document.getElementById('as-gstin')?.value || '' });
    _close(); _toast('Supplier added ✅', 'success');
    sups = await _GET('/suppliers'); c.innerHTML = html();
  };

  window.showPaySupplier = (id, name, maxDue) => {
    _modal(`💳 Pay Supplier: ${name}`, `
      <div class="field"><label>Outstanding Balance</label><input class="input" value="₹${maxDue.toLocaleString('en-IN')}" disabled></div>
      <div class="field"><label>Payment Amount (₹)</label><input class="input" type="number" id="pay-amt" value="${maxDue}" max="${maxDue}"></div>
      <div class="alert-strip info" style="margin-top:12px">This payment will reduce the supplier's due balance.</div>
    `, `
      <button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:1" onclick="execPaySupplier(${id}, ${maxDue})">Settle Amount</button>
    `);
  };

  window.execPaySupplier = async (id, maxDue) => {
    const amt = parseFloat(document.getElementById('pay-amt')?.value);
    if (!amt || amt <= 0 || amt > maxDue) { _toast('Invalid payment amount', 'error'); return; }
    
    const btn = event.currentTarget;
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
      await _POST('/suppliers/' + id + '/pay', { amount: amt });
      _close(); _toast('Payment logged ✅', 'success');
      sups = await _GET('/suppliers'); c.innerHTML = html();
    } catch(e) {
      _toast(e.message, 'error');
      btn.disabled = false; btn.textContent = 'Settle Amount';
    }
  };
}

// shelves.js — Shelf map
export async function renderShelves(c, APP) {
  const { GET: _GET } = await import('./api.js');
  const racks  = await _GET('/racks');
  const drugs  = await _GET('/inventory');
  const drugMap = {};
  drugs.forEach(d => { if (d.rack && d.shelf) drugMap[d.rack + '-' + d.shelf] = d; });
  const maxShelves = Math.max(...racks.map(r => r.shelves), 1);
  const shelfLabels = Array.from({ length: maxShelves }, (_, i) => i === 4 ? `S${i+1} 👁` : i === 5 ? `S${i+1} ↓` : `S${i+1}`);

  c.innerHTML = `<div class="gap-16 fade-in">
    <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Shelf Map</h2>
      <div style="color:var(--muted);font-size:12px">${racks.length} racks · Hover cell for drug details</div></div>
    <div class="card">
      <div style="display:flex;gap:0;overflow-x:auto">
        <div style="width:56px;flex-shrink:0">
          <div style="height:26px"></div>
          ${shelfLabels.map((s, i) => `<div style="height:38px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:10px;color:${i===4?'var(--accent)':i===5?'var(--text)':'var(--muted)'};font-weight:${i>=4?700:400}">${s}</div>`).join('')}
        </div>
        ${racks.map(rack => `<div style="flex:1;min-width:60px;margin-right:5px">
          <div style="height:26px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:${rack.color}">${rack.name}</div>
          ${Array.from({ length: maxShelves }, (_, si) => {
            const shelf = 'S' + (si + 1);
            const key   = rack.rack_id + '-' + shelf;
            const cell  = drugMap[key];
            const inRack = (si + 1) <= rack.shelves;
            if (!inRack) return `<div style="height:36px;margin-bottom:3px"></div>`;
            return `<div class="shelf-cell" title="${cell ? cell.name + ' — ' + cell.stock_tablets + ' tabs' : shelf + ' (empty)'}"
              style="background:${cell ? rack.color+'22' : 'var(--faint)'};border-color:${cell ? rack.color+'55' : 'var(--border)'};margin-bottom:3px;box-shadow:${si===4&&cell?'0 0 8px '+rack.color+'33':'none'}">
              ${cell ? `<div style="font-size:8px;font-weight:700;color:${rack.color};text-align:center;line-height:1.2;overflow:hidden;padding:1px">${cell.name.split(' ')[0].slice(0,8)}</div>` : ''}
            </div>`;
          }).join('')}
          ${rack.label ? `<div style="font-size:8px;color:${rack.color};text-align:center;margin-top:4px">${rack.label}</div>` : ''}
        </div>`).join('')}
      </div>
      <div style="margin-top:12px;font-size:11px;color:var(--muted)">← Billing counter · S5 👁 = eye-level (best position) · Hover cells for details</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${racks.map(r => `<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)"><div style="width:10px;height:10px;border-radius:2px;background:${r.color}"></div>${r.name}${r.label ? ' — ' + r.label : ''}</span>`).join('')}
    </div>
  </div>`;
}

// settings.js — Settings page
export async function renderSettings(c, APP) {
  const { GET: _GET, POST: _POST } = await import('./api.js');
  const { toast: _toast } = await import('./utils.js');
  const cfg = await _GET('/config');

  c.innerHTML = `<div class="gap-16 fade-in">
    <h2 style="font-size:18px;font-weight:800">Settings</h2>
    <div class="card gap-12">
      <div class="section-title">Shop Information</div>
      <div class="grid-2">
        <div class="field"><label>Shop Name *</label><input class="input" id="cfg-name" value="${cfg.name || ''}"></div>
        <div class="field"><label>Owner Name</label><input class="input" id="cfg-owner" value="${cfg.owner || ''}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Phone</label><input class="input" id="cfg-phone" value="${cfg.phone || ''}"></div>
        <div class="field"><label>GSTIN</label><input class="input" id="cfg-gstin" value="${cfg.gstin || ''}"></div>
      </div>
      <div class="field"><label>Address</label><textarea class="input" id="cfg-address" rows="2">${cfg.address || ''}</textarea></div>
      <div class="grid-2">
        <div class="field"><label>Drug Licence No.</label><input class="input" id="cfg-lic" value="${cfg.licence || ''}"></div>
        <div class="field"><label>GST Slab (%)</label>
          <select class="select" id="cfg-gst">${['0','5','12','18'].map(g => `<option value="${g}" ${cfg.gst_slab===g?'selected':''}>${g}%</option>`).join('')}</select></div>
      </div>
    </div>
    <div class="card gap-12">
      <div class="section-title">Inventory Settings</div>
      <div class="grid-2">
        <div class="field"><label>Expiry Warning (months)</label><input class="input" type="number" id="cfg-expwarn" value="${cfg.expiry_warn_months || 3}" min="1" max="12"></div>
        <div class="field"><label>Broken Strip Alert (tablets)</label><input class="input" type="number" id="cfg-bsa" value="${cfg.broken_strip_alert || 2}" min="1"></div>
      </div>
    </div>
    <div class="card gap-12">
      <div class="section-title">☁️ Cloud Backup (Google Drive)</div>
      <div style="display:flex;gap:12px;align-items:center">
        <label class="switch"><input type="checkbox" id="cfg-backup" ${cfg.backup_enabled === 'True' ? 'checked' : ''}><span class="slider"></span></label>
        <div style="font-size:13px;font-weight:600">Enable Auto-Sync to Google Drive</div>
      </div>
      <div class="field"><label>Google Drive Folder ID</label><input class="input" id="cfg-folder" value="${cfg.gdrive_folder_id || ''}" placeholder="Paste the ID of the shared folder"></div>
      <div style="color:var(--muted);font-size:11px">Requires <code>credentials.json</code> in the server root. Backs up on every billing transaction.</div>
      <div style="margin-top:8px;display:flex;gap:12px">
        <button class="btn btn-outline btn-sm" onclick="manualBackup()" style="flex:1">🚀 Trigger Manual Backup</button>
      </div>
    </div>
    <button class="btn btn-primary" onclick="saveSettings()">💾 Save Settings</button>
  </div>`;

  window.saveSettings = async () => {
    const data = {
      name:    document.getElementById('cfg-name')?.value?.trim() || '',
      owner:   document.getElementById('cfg-owner')?.value || '',
      phone:   document.getElementById('cfg-phone')?.value || '',
      gstin:   document.getElementById('cfg-gstin')?.value || '',
      address: document.getElementById('cfg-address')?.value || '',
      licence: document.getElementById('cfg-lic')?.value || '',
      gst_slab: document.getElementById('cfg-gst')?.value || '12',
      expiry_warn_months: parseInt(document.getElementById('cfg-expwarn')?.value || 3),
      broken_strip_alert: parseInt(document.getElementById('cfg-bsa')?.value || 2),
      fast2sms_key: document.getElementById('cfg-smskey')?.value?.trim() || '',
      backup_enabled: document.getElementById('cfg-backup')?.checked ? 'True' : 'False',
      gdrive_folder_id: document.getElementById('cfg-folder')?.value?.trim() || '',
    };
    if (!data.name) { _toast('Shop name required', 'warn'); return; }
    await _POST('/config', data);
    APP.config = { ...APP.config, ...data };
    document.getElementById('sidebar-shop-name').textContent = data.name;
    _toast('Settings saved ✅', 'success');
  };

  window.manualBackup = async () => {
    const btn = event.currentTarget;
    const oldText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Backing up...';
    try {
      const res = await _POST('/config/backup/manual');
      if (res.ok) _toast('Backup started in background! ☁️', 'success');
      else _toast(res.message, 'error');
    } catch(e) {
      _toast('Backup failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = oldText;
    }
  };
}

// ── Backorders page ───────────────────────────────────────────────────────────
export async function renderBackorders(c, APP) {
  const { GET: _GET, POST: _POST } = await import('./api.js');
  const { toast: _toast, fmt: _fmt, formatDate: _fd } = await import('./utils.js');

  async function load() {
    const [pending, all] = await Promise.all([
      _GET('/backorders?status=pending'),
      _GET('/backorders'),
    ]);
    const notified   = all.filter(b => b.status === 'notified').length;
    const cancelled  = all.filter(b => b.status === 'cancelled').length;

    c.innerHTML = `<div class="gap-16 fade-in">
      <div class="flex-between">
        <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">🔔 Backorders</h2>
          <div style="color:var(--muted);font-size:12px">Customers waiting for out-of-stock medicines</div></div>
      </div>
      <div class="grid-4" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat-card"><div class="stat-val" style="color:var(--warn)">${pending.length}</div><div class="stat-lbl">Pending</div></div>
        <div class="stat-card"><div class="stat-val" style="color:var(--green)">${notified}</div><div class="stat-lbl">Notified</div></div>
        <div class="stat-card"><div class="stat-val" style="color:var(--muted)">${cancelled}</div><div class="stat-lbl">Cancelled</div></div>
        <div class="stat-card"><div class="stat-val" style="color:var(--accent)">${all.length}</div><div class="stat-lbl">Total</div></div>
      </div>
      ${pending.length === 0
        ? '<div class="card" style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:48px;margin-bottom:12px">🎉</div><div>No pending backorders</div></div>'
        : `<div class="card" style="padding:0;overflow:auto">
          <table class="tbl">
            <thead><tr><th>Drug</th><th>Customer</th><th>Phone</th><th>Strips</th><th>Notes</th><th>Requested</th><th></th></tr></thead>
            <tbody>${pending.map(bo => `<tr>
              <td><div style="font-weight:700">${bo.drug_name}</div><div style="font-size:11px;color:var(--muted)">${bo.brand || ''}</div></td>
              <td style="font-weight:600">${bo.customer_name}</td>
              <td style="color:var(--accent);font-family:monospace">${bo.phone}</td>
              <td>${bo.qty_strips || 1}</td>
              <td style="color:var(--muted);font-size:12px">${bo.notes || '—'}</td>
              <td style="font-size:11px;color:var(--muted)">${_fd ? _fd(bo.created_at) : bo.created_at?.slice(0,10)}</td>
              <td style="display:flex;gap:6px">
                <button class="btn btn-primary btn-sm" onclick="manualNotify(${bo.id})">📱 Notify</button>
                <button class="btn btn-outline btn-sm" onclick="cancelBO(${bo.id})">✕</button>
              </td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`}
    </div>`;

    window.manualNotify = async (id) => {
      await fetch('/api/backorders/' + id + '/notify', { method: 'PUT', headers: { 'x-token': localStorage.getItem('pp_token') || '' } });
      _toast('Customer notified via SMS ✅', 'success');
      load();
    };
    window.cancelBO = async (id) => {
      await fetch('/api/backorders/' + id + '/cancel', { method: 'PUT', headers: { 'x-token': localStorage.getItem('pp_token') || '' } });
      _toast('Backorder cancelled', 'info');
      load();
    };
  }
  load();
}

// ── Bill History with Returns ─────────────────────────────────────────────────
export async function renderBillHistory(c, APP) {
  const { GET: _GET, POST: _POST } = await import('./api.js');
  const { toast: _toast, fmt: _fmt, fmtI: _fmtI, modal: _modal, closeModal: _close } = await import('./utils.js');

  const bills = await _GET('/bills?limit=100');

  function statusTag(pm) {
    const colors = { Cash: 'tag-green', UPI: 'tag-teal', Card: 'tag-amber', Credit: 'tag-red' };
    return `<span class="tag ${colors[pm] || 'tag-gray'}">${pm}</span>`;
  }

  c.innerHTML = `<div class="gap-16 fade-in">
    <div class="flex-between">
      <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">🧾 Bill History</h2>
        <div style="color:var(--muted);font-size:12px">${bills.length} recent bills</div></div>
    </div>
    <div class="card" style="padding:0;overflow:auto">
      <table class="tbl">
        <thead><tr><th>Bill No.</th><th>Patient</th><th>Amount</th><th>Payment</th><th>Cashier</th><th>Date</th><th></th></tr></thead>
        <tbody>${bills.map(b => `<tr>
          <td style="font-family:monospace;font-weight:700;color:var(--accent)">${b.bill_no}</td>
          <td>${b.patient_name || b.customer_name || '<span style="color:var(--muted)">Walk-in</span>'}</td>
          <td style="font-weight:800">₹${(b.total || 0).toFixed(2)}</td>
          <td>${statusTag(b.payment_mode)}</td>
          <td style="color:var(--muted);font-size:12px">${b.cashier || '—'}</td>
          <td style="font-size:11px;color:var(--muted)">${b.created_at?.slice(0,16) || ''}</td>
          <td><button class="btn btn-outline btn-sm" onclick="openReturnModal(${b.id},'${b.bill_no}')">↩ Return</button></td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  window.openReturnModal = async (billId, billNo) => {
    const bill = await _GET('/bills/' + billId);
    _modal(`↩ Return — ${billNo}`, `
      <div class="alert-strip info" style="margin-bottom:12px">Select items and quantity to return. Stock will be restored automatically.</div>
      <table class="tbl" style="margin-bottom:12px">
        <thead><tr><th>Return?</th><th>Drug</th><th>Billed</th><th>Return Qty</th></tr></thead>
        <tbody>${(bill.items || []).map((item, i) => `<tr>
          <td><input type="checkbox" class="ret-chk" data-i="${i}" data-item="${item.id}" data-drug="${item.drug_id}" data-batch="${item.batch_id || ''}" data-tabs="${item.tablets_qty}" style="accent-color:var(--accent)" checked></td>
          <td><div style="font-weight:700">${item.name}</div><div style="font-size:11px;color:var(--muted)">${item.brand || ''}</div></td>
          <td style="font-weight:700">${item.tablets_qty} tabs</td>
          <td><input class="input" type="number" id="ret-qty-${i}" value="${item.tablets_qty}" min="1" max="${item.tablets_qty}" style="width:70px"></td>
        </tr>`).join('')}
        </tbody>
      </table>
      <div class="grid-2">
        <div class="field"><label>Reason</label><input class="input" id="ret-reason" placeholder="e.g. Wrong drug, patient bought elsewhere"></div>
        <div class="field"><label>Refund Mode</label>
          <select class="select" id="ret-refund">
            <option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Card">Card</option>
          </select>
        </div>
      </div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:2" onclick="submitReturn(${billId})">↩ Process Return</button>`
    );
  };

  window.submitReturn = async (billId) => {
    const checked = [...document.querySelectorAll('.ret-chk:checked')];
    if (!checked.length) { _toast('Select at least one item', 'warn'); return; }
    const items = checked.map(chk => {
      const i = chk.dataset.i;
      return {
        bill_item_id: parseInt(chk.dataset.item),
        drug_id:      parseInt(chk.dataset.drug),
        batch_id:     parseInt(chk.dataset.batch) || null,
        tablets_qty:  parseInt(document.getElementById('ret-qty-' + i)?.value || chk.dataset.tabs),
      };
    });
    const res = await _POST('/returns', {
      bill_id: billId,
      items,
      reason:      document.getElementById('ret-reason')?.value || '',
      refund_mode: document.getElementById('ret-refund')?.value || 'Cash',
    });
    _close();
    _toast(`↩ Return ${res.return_no} · Refund ₹${(res.total_refund || 0).toFixed(2)}`, 'success');
  };
}

