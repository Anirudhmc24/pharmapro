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
      <div class="section-title">🤖 AI Assistant Settings</div>
      <div class="field">
        <label>Gemini API Key</label>
        <input class="input" id="cfg-geminikey" type="password" value="${cfg.gemini_api_key || ''}" placeholder="AIzaSy...">
      </div>
      <div style="color:var(--muted);font-size:11px">Used for AI features such as Scanning Medicine Strips and Supplier Invoices.</div>
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
    <div class="card gap-12">
      <div class="section-title">📂 Offline Database Backup & Restore</div>
      <div style="color:var(--muted);font-size:11px;margin-bottom:8px">Export your local database to keep backup files, or upload an exported backup to restore your data on this device.</div>
      <div style="display:flex;gap:12px">
        <button class="btn btn-outline btn-sm" onclick="exportDatabase()" style="flex:1">📥 Export Database</button>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('db-import-file').click()" style="flex:1">📤 Restore Database</button>
        <input type="file" id="db-import-file" accept=".db" style="display:none" onchange="importDatabase(this.files[0])">
      </div>
    </div>
    <button class="btn btn-primary" onclick="saveSettings()">💾 Save Settings</button>
  </div>`;

  function extractGDriveFolderId(val) {
    if (!val) return '';
    val = val.trim();
    const folderMatch = val.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (folderMatch) return folderMatch[1];
    const queryMatch = val.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (queryMatch) return queryMatch[1];
    if (!val.includes('drive.google.com') && !val.includes('/')) return val;
    const tokenMatch = val.match(/([a-zA-Z0-9-_]{20,})/);
    if (tokenMatch) return tokenMatch[0];
    return val;
  }

  window.saveSettings = async () => {
    const rawFolder = document.getElementById('cfg-folder')?.value || '';
    const cleanFolder = extractGDriveFolderId(rawFolder);

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
      gemini_api_key: document.getElementById('cfg-geminikey')?.value?.trim() || '',
      backup_enabled: document.getElementById('cfg-backup')?.checked ? 'True' : 'False',
      gdrive_folder_id: cleanFolder,
    };
    if (!data.name) { _toast('Shop name required', 'warn'); return; }
    await _POST('/config', data);
    APP.config = { ...APP.config, ...data };
    document.getElementById('sidebar-shop-name').textContent = data.name;
    if (document.getElementById('cfg-folder')) {
      document.getElementById('cfg-folder').value = cleanFolder;
    }
    _toast('Settings saved ✅', 'success');
  };

  window.manualBackup = async () => {
    const rawFolder = document.getElementById('cfg-folder')?.value || '';
    const cleanFolder = extractGDriveFolderId(rawFolder);
    
    if (cleanFolder !== (APP.config?.gdrive_folder_id || '')) {
      _toast('Saving new settings first...', 'info');
      await saveSettings();
    }

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

  window.exportDatabase = () => {
    const token = localStorage.getItem('token') || '';
    window.open('/api/config/db/export?token=' + encodeURIComponent(token), '_blank');
  };

  window.importDatabase = async (file) => {
    if (!file) return;
    if (!confirm('Are you sure you want to restore this database? This will completely overwrite all current stock, inventory, and billing data on this device.')) {
      document.getElementById('db-import-file').value = '';
      return;
    }
    const token = localStorage.getItem('token') || '';
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/config/db/import', {
        method: 'POST',
        headers: {
          'X-Token': token
        },
        body: formData
      }).then(r => r.json());
      if (res.ok) {
        _toast('Database restored successfully! Reloading page...', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        _toast(res.error || res.message || 'Restore failed', 'error');
      }
    } catch(e) {
      _toast('Restore failed: ' + e.message, 'error');
    } finally {
      document.getElementById('db-import-file').value = '';
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
                <button class="btn btn-outline btn-sm" style="color:#10b981;border-color:#10b98144;font-weight:700" onclick="window.open('https://wa.me/91' + '${bo.phone}'.replace(/\\D/g,'') + '?text=Hi%20' + encodeURIComponent('${bo.customer_name}') + ',%20your%20medicines%20have%20arrived%20in%20Shrivari%20Medicals.%20Kindly%20come%20at%20your%20convenience%20and%20collect.', '_blank')">💬 WhatsApp</button>
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
  const { GET: _GET, POST: _POST, PUT: _PUT } = await import('./api.js');
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
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline btn-sm" onclick="openViewBillModal(${b.id},'${b.bill_no}')">👁️ View</button>
              <button class="btn btn-outline btn-sm" onclick="openEditBillModal(${b.id},'${b.bill_no}')">✏️ Edit</button>
              <button class="btn btn-outline btn-sm" onclick="openReturnModal(${b.id},'${b.bill_no}')">↩ Return</button>
            </div>
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  window.openViewBillModal = async (billId, billNo) => {
    const bill = await _GET('/bills/' + billId);
    
    const itemsHtml = bill.items.map(item => `
      <tr>
        <td>
          <div style="font-weight:700">${item.name}</div>
          <div style="font-size:11px;color:var(--muted)">${item.brand || ''}</div>
        </td>
        <td>${item.batch_no || '—'}</td>
        <td>${item.expiry || '—'}</td>
        <td style="text-align:right">${item.tablets_qty}</td>
        <td style="text-align:right">₹${item.mrp_per_tab.toFixed(2)}</td>
        <td style="text-align:right;font-weight:700">₹${item.amount.toFixed(2)}</td>
      </tr>
    `).join('');

    const bodyHtml = `
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;max-height: 70vh;overflow-y: auto;">
        <div class="grid-2">
          <div><span style="color:var(--muted)">Patient:</span> <strong>${bill.patient_name || 'Walk-in'}</strong></div>
          <div><span style="color:var(--muted)">Doctor:</span> <strong>${bill.doctor || '—'}</strong></div>
        </div>
        <div class="grid-2">
          <div><span style="color:var(--muted)">Rx No:</span> <strong>${bill.rx_no || '—'}</strong></div>
          <div><span style="color:var(--muted)">Date:</span> <strong>${bill.created_at || '—'}</strong></div>
        </div>
        <div class="grid-2">
          <div><span style="color:var(--muted)">Payment Mode:</span> <span class="tag tag-gray">${bill.payment_mode}</span></div>
          <div><span style="color:var(--muted)">Cashier:</span> <strong>${bill.cashier || '—'}</strong></div>
        </div>
        ${bill.customer_name ? `
        <div class="grid-2">
          <div><span style="color:var(--muted)">Customer:</span> <strong>${bill.customer_name}</strong></div>
          <div><span style="color:var(--muted)">Phone:</span> <strong>${bill.customer_phone || '—'}</strong></div>
        </div>` : ''}
        
        <div style="margin-top:8px;border-top:1px dashed var(--border);padding-top:12px">
          <table class="tbl">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th style="text-align:right">Qty</th>
                <th style="text-align:right">MRP/Tab</th>
                <th style="text-align:right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>
        
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:14px">
          <div><span style="color:var(--muted)">Subtotal:</span> <strong>₹${bill.subtotal.toFixed(2)}</strong></div>
          <div><span style="color:var(--muted)">Discount (${bill.discount_pct}%):</span> <strong style="color:var(--danger)">-₹${bill.discount_amt.toFixed(2)}</strong></div>
          <div><span style="color:var(--muted)">GST:</span> <strong>₹${bill.gst_amt.toFixed(2)}</strong></div>
          <div style="font-size:16px;font-weight:800;color:var(--accent);margin-top:4px">
            <span style="color:var(--text)">Net Total:</span> ₹${bill.total.toFixed(2)}
          </div>
        </div>
      </div>
    `;

    const printData = {
      res: bill,
      items: bill.items,
      cust: bill.customer_id ? { id: bill.customer_id, name: bill.customer_name } : null,
      disc: bill.discount_pct,
      pay: bill.payment_mode
    };

    window._viewBillPrintData = printData;

    _modal(`👁️ Bill Detail — ${billNo}`, bodyHtml, `
      <button class="btn btn-outline" style="flex:1" onclick="closeModal()">Close</button>
      <button class="btn btn-outline" style="flex:1; border-color:#25d366; color:#25d366" onclick="window.open('https://wa.me/91' + '${bill.customer_phone || ''}'.replace(/\\D/g,'') + '?text=Hi%20' + encodeURIComponent(window._viewBillPrintData.res.patient_name || window._viewBillPrintData.res.customer_name || 'Customer') + ',%20here%20is%20your%20invoice%20no%20' + '${billNo}' + '%20amounting%20to%20Rs.%20' + window._viewBillPrintData.res.total.toFixed(2) + '.', '_blank')">💬 WhatsApp</button>
      <button class="btn btn-outline" style="flex:1" onclick="window.printChallan(window._viewBillPrintData)">🚗 Challan</button>
      <button class="btn btn-primary" style="flex:1.2" onclick="window.printBill(window._viewBillPrintData)">🖨️ Print Bill</button>
    `);
  };

  window.openEditBillModal = async (billId, billNo) => {
    const bill = await _GET('/bills/' + billId);
    let editCart = bill.items.map(item => ({
      drug_id: item.drug_id,
      name: item.name,
      brand: item.brand,
      mrp_per_tab: item.mrp_per_tab,
      qty: item.tablets_qty
    }));

    window.updateEditQty = (idx, delta) => {
      editCart[idx].qty = Math.max(1, editCart[idx].qty + delta);
      renderEditCartTable();
    };

    window.setEditQty = (idx, val) => {
      const q = parseInt(val);
      if (q > 0) {
        editCart[idx].qty = q;
        renderEditCartTable();
      }
    };

    window.removeEditItem = (idx) => {
      editCart.splice(idx, 1);
      renderEditCartTable();
    };

    window.addDrugToEditByIndex = (idx) => {
      const drug = window._editSearchDrugs[idx];
      if (!drug) return;
      
      const existing = editCart.find(i => i.drug_id === drug.id);
      if (existing) {
        existing.qty += 10;
      } else {
        editCart.push({
          drug_id: drug.id,
          name: drug.name,
          brand: drug.brand || '',
          mrp_per_tab: drug.mrp_per_tablet,
          qty: 10
        });
      }
      const searchInput = document.getElementById('edit-drug-search');
      if (searchInput) searchInput.value = '';
      const resultsDiv = document.getElementById('edit-drug-results');
      if (resultsDiv) resultsDiv.innerHTML = '';
      renderEditCartTable();
    };

    window.onEditSearchInput = async (val) => {
      const q = val.trim();
      const resultsDiv = document.getElementById('edit-drug-results');
      if (!resultsDiv) return;
      if (!q) { resultsDiv.innerHTML = ''; return; }
      
      const drugs = await _GET('/drugs?q=' + encodeURIComponent(q));
      if (!drugs.length) {
        resultsDiv.innerHTML = '<div style="padding:8px;color:var(--muted)">No medicines found</div>';
        return;
      }
      
      window._editSearchDrugs = drugs;
      
      resultsDiv.innerHTML = drugs.map((d, i) => `
        <div class="edit-search-item" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.2s" 
             onmouseover="this.style.background='var(--faint)'" onmouseout="this.style.background='transparent'"
             onclick="window.addDrugToEditByIndex(${i})">
          <strong style="color:var(--text)">${d.name}</strong> <span style="font-size:11px;color:var(--muted)">${d.brand || ''}</span>
          <div style="font-size:11px;color:var(--accent);margin-top:2px">Stock: ${d.stock_tablets} tabs · MRP: ₹${d.mrp_per_tablet.toFixed(2)}/tab</div>
        </div>
      `).join('');
    };

    const gstSlab = parseFloat(APP?.config?.gst_slab || 12);

    window.recalculateEditTotals = () => {
      const subtotal = editCart.reduce((sum, item) => sum + (item.mrp_per_tab * item.qty), 0);
      const discPct = parseFloat(document.getElementById('edit-disc-pct')?.value || 0);
      
      const pctDiscAmt = (subtotal * discPct) / 100.0;
      const discAmt = pctDiscAmt; // Simplification as points redeemed isn't stored
      
      const gstInclusive = document.getElementById('edit-gst-inclusive')?.checked;
      
      let baseSubtotal, gstAmt, total;
      
      if (gstInclusive) {
        baseSubtotal = subtotal / (1 + gstSlab / 100);
        const actualPctDiscAmt = (baseSubtotal * discPct) / 100.0;
        const actualDiscAmt = actualPctDiscAmt;
        const taxable = baseSubtotal - actualDiscAmt;
        gstAmt = taxable * gstSlab / 100;
        total = baseSubtotal - actualDiscAmt + gstAmt;
      } else {
        gstAmt = (subtotal - discAmt) * gstSlab / 100;
        total = subtotal - discAmt + gstAmt;
      }
      
      document.getElementById('edit-subtotal').textContent = '₹' + subtotal.toFixed(2);
      document.getElementById('edit-disc-amt').textContent = '-₹' + discAmt.toFixed(2);
      document.getElementById('edit-gst-amt').textContent = '₹' + gstAmt.toFixed(2);
      document.getElementById('edit-total').textContent = '₹' + total.toFixed(2);
    };

    const bodyHtml = `
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;max-height: 65vh;overflow-y: auto;padding-right: 4px;">
        <div class="grid-2">
          <div class="field"><label>Patient Name *</label><input class="input" id="edit-patient-name" value="${bill.patient_name || ''}"></div>
          <div class="field"><label>Doctor</label><input class="input" id="edit-doctor" value="${bill.doctor || ''}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Rx No</label><input class="input" id="edit-rx-no" value="${bill.rx_no || ''}"></div>
          <div class="field"><label>Payment Mode</label>
            <select class="select" id="edit-payment-mode">
              <option value="Cash" ${bill.payment_mode === 'Cash' ? 'selected' : ''}>Cash</option>
              <option value="UPI" ${bill.payment_mode === 'UPI' ? 'selected' : ''}>UPI</option>
              <option value="Card" ${bill.payment_mode === 'Card' ? 'selected' : ''}>Card</option>
              <option value="Credit" ${bill.payment_mode === 'Credit' ? 'selected' : ''}>Credit</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Discount (%)</label><input class="input" type="number" id="edit-disc-pct" value="${bill.discount_pct || 0}" min="0" max="100" oninput="recalculateEditTotals()"></div>
          <div class="field" style="display:flex;align-items:center;margin-top:20px;gap:8px">
            <label class="switch"><input type="checkbox" id="edit-gst-inclusive" ${bill.gst_inclusive ? 'checked' : ''} onchange="recalculateEditTotals()"><span class="slider"></span></label>
            <div style="font-weight:600">GST Inclusive Pricing</div>
          </div>
        </div>
        
        <div class="field" style="position:relative">
          <label>🔍 Add Medicine</label>
          <input class="input" id="edit-drug-search" placeholder="Type medicine name, composition or brand..." oninput="onEditSearchInput(this.value)">
          <div id="edit-drug-results" style="position:absolute;top:100%;left:0;right:0;background:var(--card-bg);border:1px solid var(--border);border-top:none;z-index:1000;max-height:200px;overflow-y:auto;border-radius:0 0 6px 6px;box-shadow:0 8px 16px rgba(0,0,0,0.1)"></div>
        </div>

        <div style="margin-top:8px">
          <table class="tbl">
            <thead>
              <tr>
                <th>Drug</th>
                <th style="width:140px">Qty (tabs)</th>
                <th style="text-align:right">MRP/Tab</th>
                <th style="text-align:right">Amount</th>
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody id="edit-bill-items-body">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
        </div>
        
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:14px">
          <div><span style="color:var(--muted)">Subtotal:</span> <strong id="edit-subtotal">₹0.00</strong></div>
          <div><span style="color:var(--muted)">Discount:</span> <strong id="edit-disc-amt" style="color:var(--danger)">-₹0.00</strong></div>
          <div><span style="color:var(--muted)">GST (${gstSlab}%):</span> <strong id="edit-gst-amt">₹0.00</strong></div>
          <div style="font-size:16px;font-weight:800;color:var(--accent);margin-top:4px">
            <span style="color:var(--text)">Net Total:</span> <span id="edit-total">₹0.00</span>
          </div>
        </div>
      </div>
    `;

    _modal(`✏️ Edit Bill — ${billNo}`, bodyHtml, `
      <button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:2" onclick="submitEditBill(${billId})">💾 Save Changes</button>
    `);

    window.renderEditCartTable = () => {
      const tbody = document.getElementById('edit-bill-items-body');
      if (!tbody) return;
      tbody.innerHTML = editCart.map((item, idx) => `
        <tr>
          <td>
            <div style="font-weight:700">${item.name}</div>
            <div style="font-size:11px;color:var(--muted)">${item.brand || ''}</div>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <button class="btn btn-outline btn-sm" style="padding:2px 6px" onclick="updateEditQty(${idx}, -1)">−</button>
              <input class="input" type="number" value="${item.qty}" min="1" style="width:60px;text-align:center;padding:2px" onchange="setEditQty(${idx}, this.value)">
              <button class="btn btn-outline btn-sm" style="padding:2px 6px" onclick="updateEditQty(${idx}, 1)">+</button>
            </div>
          </td>
          <td style="text-align:right">₹${item.mrp_per_tab.toFixed(2)}</td>
          <td style="text-align:right;font-weight:700">₹${(item.mrp_per_tab * item.qty).toFixed(2)}</td>
          <td>
            <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:rgba(239,68,68,0.2);padding:2px 6px" onclick="removeEditItem(${idx})">✕</button>
          </td>
        </tr>
      `).join('');
      recalculateEditTotals();
    };

    renderEditCartTable();

    window.submitEditBill = async (id) => {
      if (!editCart.length) { _toast('Add at least one item', 'warn'); return; }
      
      const patName = document.getElementById('edit-patient-name')?.value.trim();
      if (!patName) { _toast('Patient name required', 'warn'); return; }

      const payload = {
        customer_id: bill.customer_id,
        patient_name: patName,
        doctor: document.getElementById('edit-doctor')?.value.trim() || '',
        rx_no: document.getElementById('edit-rx-no')?.value.trim() || '',
        rx_image_path: bill.rx_image_path || '',
        discount_pct: parseFloat(document.getElementById('edit-disc-pct')?.value || 0),
        payment_mode: document.getElementById('edit-payment-mode')?.value || 'Cash',
        points_redeemed: 0,
        gst_inclusive: document.getElementById('edit-gst-inclusive')?.checked || false,
        items: editCart.map(item => ({
          drug_id: item.drug_id,
          tablets_qty: item.qty
        }))
      };

      try {
        await _PUT('/bills/' + id, payload);
        _close();
        _toast('Bill updated successfully ✅', 'success');
        renderBillHistory(c, APP);
      } catch (e) {
        _toast('Failed to update bill: ' + e.message, 'error');
      }
    };
  };

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

