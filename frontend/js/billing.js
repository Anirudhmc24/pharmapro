// billing.js — Billing page with FEFO, print, and customer search
import { GET, POST } from './api.js';
import { fmt, fmtI, tag, stripVis, toast, modal, closeModal } from './utils.js';
import { showSubstitutesModal } from './substitutes.js';

export async function renderBilling(c, APP) {
  let cart = [], customer = null, discount = 0, payMode = 'Cash', redeemPoints = false;
  let interactions = [];

  window.toggleRedeem = (checked) => { redeemPoints = checked; window.billApplyState(); };
  
  window.checkInteractionsAsync = async () => {
    if (cart.length < 2) {
      if (interactions.length > 0) { interactions = []; c.innerHTML = billHTML(); }
      return;
    }
    const ids = cart.map(i => i.id).join(',');
    const res = await GET(`/drugs/check_interactions?drug_ids=${ids}`);
    if (JSON.stringify(res) !== JSON.stringify(interactions)) {
      interactions = res;
      c.innerHTML = billHTML();
    }
  };

  window.billApplyState = () => {
    c.innerHTML = billHTML();
    window.checkInteractionsAsync();
  };

  function billHTML() {
    const ptsRedeemed = (customer && redeemPoints) ? customer.loyalty_points : 0;
    const subtotal = cart.reduce((s, item) => {
      let activeQty = item.qty;
      if (item.offer_type === 'BOGO') {
        activeQty = item.qty - Math.floor(item.qty / 2);
      }
      return s + activeQty * item.mrp_per_tablet;
    }, 0);
    const pctDiscAmt = subtotal * discount / 100;
    const discAmt  = pctDiscAmt + ptsRedeemed;
    const gst      = Math.max(0, (subtotal - discAmt) * 0.12);
    const total    = Math.max(0, subtotal - discAmt + gst);
    return `
    <div style="display:grid;grid-template-columns:1fr 340px;gap:18px;height:calc(100vh - 130px)" class="billing-layout">
      <div class="gap-12" style="overflow:hidden;display:flex;flex-direction:column">
        <div style="display:flex; gap:10px; align-items:center">
          <div class="search-wrap" style="flex:1">
            <span class="search-icon">🔍</span>
            <input class="input" id="bill-search" placeholder="Search drug by name, brand or composition…" autocomplete="off" oninput="billSearch(this.value)">
            <div class="search-drop" id="bill-drop" style="display:none"></div>
          </div>
          <button class="btn btn-outline" onclick="window.showCustomDrugModal('')" style="white-space:nowrap; padding:9px 14px; display:flex; align-items:center; gap:6px;">
            <span>➕</span> <span>Custom Item</span>
          </button>
        </div>
        ${interactions.length > 0 ? `
          <div style="padding:0 12px">
            ${interactions.map(x => `
              <div class="alert-strip ${x.severity.toLowerCase() === 'critical' ? 'danger' : x.severity.toLowerCase() === 'major' ? 'warn' : 'info'}" style="margin-bottom:8px">
                <b style="text-transform:uppercase">${x.severity} INTERACTION:</b> <b>${x.drugs.join(' + ')}</b><br/>${x.message}
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="card" style="flex:1;overflow:auto;padding:0;margin-top:0">
          ${cart.length === 0 ? `<div style="height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--muted);gap:8px"><span style="font-size:36px">💊</span><span>Search and add medicines above</span></div>` : `
          <table class="tbl">
            <thead><tr><th>Medicine</th><th>Qty</th><th>Breakdown</th><th>Rate</th><th style="text-align:right">Amount</th><th></th></tr></thead>
            <tbody>${cart.map((item, i) => {
              const tps        = item.tablets_per_strip || 10;
              const fullStrips = Math.floor(item.qty / tps), loose = item.qty % tps;
              
              let activeQty = item.qty;
              let isBogo = item.offer_type === 'BOGO';
              if (isBogo) activeQty = item.qty - Math.floor(item.qty / 2);
              
              const amt = activeQty * item.mrp_per_tablet;
              return `<tr>
                <td><div style="font-weight:700;color:var(--text)">${item.name} ${isBogo ? tag('BOGO', 'tag-amber') : ''}</div>
                    <div style="font-size:11px;color:var(--muted)">${item.brand || ''} · ${tag(item.schedule === 'Rx' ? 'Rx' : 'OTC', item.schedule === 'Rx' ? 'tag-red' : 'tag-green')}</div></td>
                <td><div class="qty-ctrl">
                  <button class="qty-btn" onclick="cartQty(${i},${item.qty-1})">−</button>
                  <input class="qty-val" type="number" value="${item.qty}" min="1" onchange="cartQty(${i},+this.value)">
                  <button class="qty-btn" onclick="cartQty(${i},${item.qty+1})">+</button>
                </div></td>
                <td><div style="font-size:12px;color:var(--accent);font-weight:700">${fullStrips > 0 ? fullStrips + ' ' + (item.pack_type || 'Strip').toLowerCase() + (fullStrips > 1 ? 's' : '') : ''}${loose > 0 ? (fullStrips ? ' +' : '') + ' ' + loose + ' loose' : ''}</div></td>
                <td style="font-weight:700">${fmt(item.mrp_per_tablet)}</td>
                <td style="text-align:right;font-weight:800;color:var(--accent)">${fmt(amt)}</td>
                <td><button style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px" onclick="cartRemove(${i})">✕</button></td>
              </tr>`;
            }).join('')}</tbody>
          </table>`}
        </div>
      </div>

      <div class="gap-12">
        <div class="card">
        <div class="card">
          <div class="section-title">Customer & Prescription</div>
          ${customer ? `<div class="flex-between">
            <div><div style="font-weight:700">${customer.name}</div><div style="font-size:11px;color:var(--muted)">${customer.phone || ''} · 🎯 ${customer.loyalty_points || 0} pts</div></div>
            <button style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px" onclick="billClearCustomer()">✕</button>
          </div>` : `
          <div class="search-wrap">
            <span class="search-icon">👤</span>
            <input class="input" id="cust-search" placeholder="Search or type patient name…" autocomplete="off" oninput="custSearch(this.value)">
            <div class="search-drop" id="cust-drop" style="display:none"></div>
          </div>`}
          
          <div style="display:flex;gap:12px;margin-top:12px">
            <div class="field" style="flex:1"><label>Doctor</label>
              <input class="input" id="bill-doctor" placeholder="Dr. Name"></div>
            <div class="field"><label>Rx No</label>
              <input class="input" id="bill-rx" placeholder="Optional"></div>
          </div>
          <div class="field" style="margin-top:12px">
            <label>Upload Prescription (Image)</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <button type="button" class="btn btn-outline btn-sm" onclick="var f=document.getElementById('bill-rx-file');f.value='';f.click()">📷 Choose Image</button>
              <span id="rx-file-name" style="font-size:11px;color:var(--muted)"></span>
            </div>
            <input type="file" id="bill-rx-file" accept="image/*" capture="environment" class="file-input-hidden" onchange="uploadRx(this.files[0]); var nameEl=document.getElementById('rx-file-name'); if(nameEl && this.files[0]) nameEl.textContent=this.files[0].name">
            <input type="hidden" id="bill-rx-path">
            <div id="rx-upload-status" style="font-size:11px;color:var(--muted);margin-top:4px"></div>
          </div>
        </div>

        <div class="card" style="flex:1">
          <div class="section-title">Bill Summary</div>
          <div class="gap-12">
            ${[['Subtotal', fmt(subtotal)], ['Discount', discount + '%'], ['Disc. Amount', '− ' + fmt(discAmt)], ['GST (12%)', '+' + fmt(gst)]].map(([k, v]) =>
              `<div class="flex-between" style="font-size:13px;color:var(--muted)"><span>${k}</span><span style="color:var(--text)">${v}</span></div>`
            ).join('')}
            <div class="flex-between" style="font-size:20px;font-weight:900;border-top:1px solid var(--border);padding-top:10px">
              <span>Total</span><span style="color:var(--accent)">${fmtI(total)}</span>
            </div>
          </div>
          <div class="field" style="margin-top:14px"><label>Discount %</label>
            <input class="input" type="number" min="0" max="30" value="${discount}" oninput="billDiscount(+this.value)">
          </div>
          ${customer && customer.loyalty_points > 0 ? `
          <div style="margin-top:12px;display:flex;align-items:center;gap:8px;font-size:13px;padding:8px;background:var(--accent-dim);border-radius:6px;border:1px solid var(--accent)">
            <input type="checkbox" id="redeem-cb" ${redeemPoints ? 'checked' : ''} onchange="toggleRedeem(this.checked)" style="width:16px;height:16px;accent-color:var(--accent)">
            <label for="redeem-cb" style="cursor:pointer;font-weight:700;color:var(--accent)">Redeem ${customer.loyalty_points} Points (− ₹${customer.loyalty_points})</label>
          </div>` : ''}
          <div style="margin-top:12px">
            <div class="section-title">Payment Mode</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${['Cash', 'UPI', 'Card', 'Credit'].map(m => `
              <button onclick="billPayMode('${m}')" style="flex:1;padding:9px 0;border-radius:8px;border:1px solid ${payMode === m ? 'var(--accent)' : 'var(--border)'};background:${payMode === m ? 'var(--accent-dim)' : 'var(--surface)'};color:${payMode === m ? 'var(--accent)' : 'var(--muted)'};font-weight:700;font-size:13px;cursor:pointer;transition:all .15s">${m}</button>`).join('')}
            </div>
          </div>
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" onclick="billClear()">Clear</button>
          <button class="btn btn-primary" style="flex:1" onclick="billGenerate()" id="bill-gen-btn">
            ${cart.length ? 'Generate Bill · ' + fmtI(total) : 'Generate Bill'}
          </button>
        </div>
      </div>
    </div>`;
  }

  c.innerHTML = billHTML();

  window.billSearch = async (q) => {
    if (q.length < 2) { document.getElementById('bill-drop').style.display = 'none'; return; }
    const drugs = await GET('/drugs?q=' + encodeURIComponent(q));
    const masterDrugs = await GET('/drugs/master_search?q=' + encodeURIComponent(q));
    
    const drop  = document.getElementById('bill-drop');
    
    let html = '';
    if (drugs?.length) {
      html += drugs.map(d => {
        const outOfStock = (d.stock_tablets || 0) === 0;
        return `
        <div class="search-item" style="${outOfStock ? 'opacity:0.7' : ''}" onclick="${outOfStock ? `showBackorderForm(${d.id},'${d.name.replace(/'/g,"\\'")}')` : `billAddDrug(${d.id})`}">
          <div>
            <div style="font-weight:700">${d.name} <span style="color:var(--muted);font-weight:400;font-size:12px">${d.brand || ''}</span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">Box ${d.box_id || '?'} · Stock: <b style="color:${outOfStock ? 'var(--danger)' : 'var(--accent)'}">${d.stock_tablets || 0}</b> ${(d.pack_type || 'Strip').toLowerCase()}s · ${tag(d.schedule === 'Rx' ? '℞ Rx' : 'OTC', d.schedule === 'Rx' ? 'tag-red' : 'tag-green')}${outOfStock ? ' · <span style="color:var(--warn);font-weight:700">⚠️ Out of Stock</span>' : ''}</div>
          </div>
          <div style="text-align:right">
            ${outOfStock
              ? `<div style="color:var(--warn);font-size:11px;font-weight:700">🔔 Notify me</div>`
              : `<div style="font-weight:800;color:var(--accent)">${fmt(d.mrp_per_tablet)}/item</div>`}
            <button class="btn btn-outline" style="padding:2px 6px;margin-top:4px;font-size:10px" onclick="event.stopPropagation(); showSubstitutes(${d.id}, '${d.name.replace(/'/g,"\\'")}')">View Alts</button>
          </div>
        </div>`;
      }).join('');
    }
    
    // Append master database results (filter out ones already in shop)
    if (masterDrugs?.length) {
      const activeNames = new Set((drugs || []).map(d => d.name.toLowerCase()));
      const newMaster = masterDrugs.filter(m => !activeNames.has(m.name.toLowerCase()));
      
      if (newMaster.length > 0) {
        html += `<div class="master-search-header">
            <span style="font-size:14px">🌐</span> Found in Master Database (Click to auto-add to shop)
          </div>`;
        html += newMaster.slice(0, 5).map(m => `
          <div class="search-item master-search-item" onclick='autoAddMasterDrug(${JSON.stringify(m).replace(/'/g, "&apos;")})'>
            <div>
              <div style="font-weight:700">${m.name} <span style="color:var(--muted);font-weight:400;font-size:12px">${m.manufacturer || ''}</span></div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${m.composition ? m.composition.substring(0,40) + '...' : ''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:800;color:var(--muted)">${fmt(m.mrp || 0)}</div>
              <div style="color:var(--accent);font-size:11px;font-weight:700;margin-top:4px">+ Auto-Add</div>
            </div>
          </div>
        `).join('');
      }
    }
    
    if (html) {
      html += `
        <div class="search-item" style="border-top:1px dashed var(--border); background:var(--accent-dim); justify-content:center; padding:10px;" onclick="window.showCustomDrugModal('${q.replace(/'/g,"\\'")}')">
          <span style="color:var(--accent);font-weight:700">➕ Add "${q}" as Custom Medicine</span>
        </div>`;
    }

    if (!html) {
      drop.innerHTML = `
        <div style="padding:12px 14px; font-size:13px; color:var(--muted); line-height:1.6">
          "${q}" not found anywhere.
          <div style="margin-top:6px; display:flex; gap:12px; align-items:center">
            <span style="color:var(--accent); cursor:pointer; font-weight:700" onclick="window.showCustomDrugModal('${q.replace(/'/g,"\\'")}')">➕ Add Custom Medicine</span>
            <span style="color:var(--muted)">|</span>
            <span style="color:var(--accent); cursor:pointer" onclick="window.showSubstitutes(0,'${q.replace(/'/g,"\\'")}', '${q.replace(/'/g,"\\'")}');">🔄 Search Alts</span>
          </div>
        </div>`;
    } else {
      drop.innerHTML = html;
    }
    drop.style.display = 'block';
  };

  window.showCustomDrugModal = (initialName) => {
    document.getElementById('bill-drop').style.display = 'none';
    
    window.onCustomPackTypeChange = (val) => {
      const lbl = document.getElementById('custom-units-label');
      const tps = document.getElementById('custom-tablets-per-strip');
      const qtyType = document.getElementById('custom-qty-type');
      if (val === 'Piece' || val === 'Bottle' || val === 'Tube') {
        if (lbl) lbl.textContent = 'Units per Pack';
        if (tps) { tps.value = 1; tps.disabled = true; }
        if (qtyType) qtyType.value = 'unit';
      } else {
        if (lbl) lbl.textContent = val === 'Box' ? 'Strips per Box' : 'Tablets per Strip';
        if (tps) { tps.disabled = false; tps.value = 10; }
        if (qtyType) qtyType.value = 'pack';
      }
      window.calcCustomRates();
    };

    window.calcCustomRates = () => {
      const mrpInput = document.getElementById('custom-mrp-strip');
      const discInput = document.getElementById('custom-discount');
      const billingInput = document.getElementById('custom-billing-rate-strip');
      if (!mrpInput || !discInput || !billingInput) return;
      const mrp = parseFloat(mrpInput.value) || 0;
      const disc = parseFloat(discInput.value) || 0;
      const billingRate = mrp * (1 - disc / 100);
      billingInput.value = billingRate.toFixed(2);
    };

    window.saveCustomDrug = async () => {
      const name = document.getElementById('custom-name')?.value?.trim();
      if (!name) { toast('Medicine name is required', 'error'); return; }
      
      const mrpInput = document.getElementById('custom-mrp-strip');
      const mrpVal = parseFloat(mrpInput?.value) || 0;
      if (mrpVal <= 0) { toast('Rate / MRP must be greater than 0', 'error'); return; }

      const discVal = parseFloat(document.getElementById('custom-discount')?.value) || 0;
      const billingRate = mrpVal * (1 - discVal / 100);

      const brand = document.getElementById('custom-brand')?.value?.trim() || 'Custom';
      const composition = document.getElementById('custom-composition')?.value?.trim() || '';
      const packType = document.getElementById('custom-pack-type')?.value || 'Strip';
      const tabletsPerStrip = parseInt(document.getElementById('custom-tablets-per-strip')?.value) || 10;
      const schedule = document.getElementById('custom-schedule')?.value || 'OTC';
      const hsn = document.getElementById('custom-hsn')?.value || '30049099';
      
      const batchNo = document.getElementById('custom-batch')?.value?.trim();
      const expiry = document.getElementById('custom-expiry')?.value;
      const qtyVal = parseInt(document.getElementById('custom-qty')?.value) || 1;
      const qtyType = document.getElementById('custom-qty-type')?.value || 'pack';

      const qty = qtyType === 'pack' ? (qtyVal * tabletsPerStrip) : qtyVal;

      const payload = {
        name,
        brand,
        composition,
        category: '',
        schedule,
        hsn,
        tablets_per_strip: tabletsPerStrip,
        strips_per_box: 10,
        mrp_per_strip: billingRate,
        mrp_per_tablet: billingRate / tabletsPerStrip,
        reorder_level: 0,
        pack_type: packType,
        offer_type: '',
        box_id: null,
        zone: 'B'
      };

      if (batchNo || expiry) {
        payload.batch_no = batchNo || 'NA';
        payload.expiry = expiry ? (expiry + '-01') : '';
        payload.initial_strips = qtyType === 'pack' ? qtyVal : Math.ceil(qtyVal / tabletsPerStrip);
      }

      try {
        toast('Saving custom medicine...', 'info');
        const res = await POST('/drugs', payload);
        if (res && res.id) {
          const drug = await GET('/drugs/' + res.id);
          const existing = cart.findIndex(i => i.id === drug.id);
          if (existing >= 0) cart[existing].qty += qty;
          else cart.push({ ...drug, qty: qty });
          
          closeModal();
          toast('✅ Added custom medicine to bill!', 'success');
          c.innerHTML = billHTML();
        } else {
          toast('Failed to save custom medicine', 'error');
        }
      } catch (err) {
        toast(err.message || 'Error saving custom medicine', 'error');
      }
    };

    const modalHtml = `
      <div class="modal-form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; max-height:60vh; overflow-y:auto; padding:4px;">
        <div class="field" style="grid-column: span 2;">
          <label style="font-weight:700">Medicine Name *</label>
          <input class="input" id="custom-name" placeholder="Enter medicine name" value="${initialName || ''}" required>
        </div>
        <div class="field">
          <label>Brand / Manufacturer</label>
          <input class="input" id="custom-brand" placeholder="e.g. Abbott, Cipla" value="Custom">
        </div>
        <div class="field">
          <label>Composition (Salt)</label>
          <input class="input" id="custom-composition" placeholder="e.g. Paracetamol 500mg">
        </div>
        <div class="field">
          <label>Pack Type</label>
          <select class="input" id="custom-pack-type" onchange="window.onCustomPackTypeChange(this.value)">
            <option value="Strip">Strip</option>
            <option value="Piece">Piece / Tablet</option>
            <option value="Bottle">Bottle</option>
            <option value="Tube">Tube</option>
            <option value="Box">Box</option>
          </select>
        </div>
        <div class="field">
          <label id="custom-units-label">Tablets per Strip</label>
          <input class="input" type="number" id="custom-tablets-per-strip" value="10" min="1">
        </div>
        <div class="field">
          <label>MRP per Pack/Strip (₹) *</label>
          <input class="input" type="number" id="custom-mrp-strip" value="0.00" step="0.01" min="0" oninput="window.calcCustomRates()">
        </div>
        <div class="field">
          <label>Discount on Item (%)</label>
          <input class="input" type="number" id="custom-discount" value="0" min="0" max="100" oninput="window.calcCustomRates()">
        </div>
        <div class="field">
          <label>Billing Rate per Pack (₹)</label>
          <input class="input" type="number" id="custom-billing-rate-strip" value="0.00" step="0.01" readonly style="background:var(--surface-dim); font-weight:700; color:var(--accent);">
        </div>
        <div class="field">
          <label>Schedule</label>
          <select class="input" id="custom-schedule">
            <option value="OTC">OTC</option>
            <option value="Rx">Rx</option>
            <option value="H">Schedule H</option>
            <option value="X">Schedule X</option>
          </select>
        </div>
        <div class="field" style="grid-column: span 2;">
          <div style="border-top:1px dashed var(--border); margin:8px 0; padding-top:8px; font-weight:bold; color:var(--muted); font-size:12px;">INVENTORY & BILLING QUANTITY (OPTIONAL)</div>
        </div>
        <div class="field" style="grid-column: span 2;">
          <label>Quantity to Add</label>
          <div style="display:flex; gap:8px;">
            <input class="input" type="number" id="custom-qty" value="1" min="1" style="flex:1">
            <select class="input" id="custom-qty-type" style="width:130px">
              <option value="pack">Packs/Strips</option>
              <option value="unit">Units/Tablets</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Batch Number</label>
          <input class="input" id="custom-batch" placeholder="e.g. B1234">
        </div>
        <div class="field">
          <label>Expiry Date</label>
          <input class="input" type="month" id="custom-expiry">
        </div>
        <div class="field">
          <label>HSN Code</label>
          <input class="input" id="custom-hsn" value="30049099">
        </div>
      </div>
    `;

    modal('➕ Add Custom Medicine to Bill', modalHtml, `
      <button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:1.5" onclick="saveCustomDrug()">➕ Save & Add to Bill</button>
    `);
    
    window.calcCustomRates();
  };

  
  window.autoAddMasterDrug = async (m) => {
    document.getElementById('bill-drop').style.display = 'none';
    toast('Auto-adding to shop inventory...', 'info');
    
    // Auto-create in shop inventory
    const res = await POST('/drugs', {
      name: m.name,
      brand: m.manufacturer || '',
      composition: m.composition || '',
      category: '',
      schedule: 'OTC',
      hsn: '30049099',
      tablets_per_strip: 10,
      strips_per_box: 10,
      mrp_per_strip: m.mrp || 0,
      mrp_per_tablet: (m.mrp || 0) / 10,
      reorder_level: 20,
      pack_type: 'Strip'
    });
    
    if (res && res.id) {
      toast('Added to shop! Adding to bill...', 'success');
      billAddDrug(res.id);
    } else {
      toast('Failed to auto-add', 'error');
    }
  };

  window.showSubstitutes = (drugId, drugName, composition) => {
    document.getElementById('bill-drop').style.display = 'none';
    showSubstitutesModal(
      { drug_id: drugId || 0, name: drugName || '', composition: composition || '' },
      (selectedDrug) => {
        // User picked an alternative — add it to the bill
        billAddDrug(selectedDrug.id);
        toast('Alternative added: ' + selectedDrug.name, 'success');
      }
    );
  };

  window.showBackorderForm = (drugId, drugName) => {
    document.getElementById('bill-drop').style.display = 'none';
    modal('🔔 Notify When Available', `
      <div class="alert-strip info" style="margin-bottom:12px">
        <b>${drugName}</b> is currently out of stock. Enter customer details to notify them when it arrives.
      </div>
      <div class="field"><label>Customer Name *</label><input class="input" id="bo-name" placeholder="Patient / Customer name" autofocus></div>
      <div class="field"><label>Mobile Number *</label><input class="input" id="bo-phone" type="tel" placeholder="10-digit mobile number"></div>
      <div class="field"><label>Strips Needed</label><input class="input" type="number" id="bo-qty" value="1" min="1"></div>
      <div class="field"><label>Notes</label><input class="input" id="bo-notes" placeholder="Any instructions…"></div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:2" onclick="saveBackorder(${drugId})">🔔 Save & Notify on Arrival</button>`
    );
  };

  window.saveBackorder = async (drugId) => {
    const name  = document.getElementById('bo-name')?.value?.trim();
    const phone = document.getElementById('bo-phone')?.value?.trim();
    if (!name || !phone) { toast('Name and phone required', 'warn'); return; }
    await POST('/backorders', {
      drug_id: drugId,
      customer_name: name,
      phone,
      qty_strips: parseInt(document.getElementById('bo-qty')?.value || 1),
      notes: document.getElementById('bo-notes')?.value || '',
    });
    closeModal();
    toast(`✅ Backorder saved! ${name} will be notified when stock arrives.`, 'success');
  };

  window.billAddDrug = async (id) => {
    const drug = await GET('/drugs/' + id);
    document.getElementById('bill-drop').style.display = 'none';
    document.getElementById('bill-search').value = '';
    const existing = cart.findIndex(i => i.id === id);
    if (existing >= 0) cart[existing].qty++;
    else cart.push({ ...drug, qty: 1 });
    c.innerHTML = billHTML();
  };

  window.cartQty    = (i, q) => { if (q <= 0) cart.splice(i, 1); else cart[i].qty = q; c.innerHTML = billHTML(); };
  window.cartRemove = (i)    => { cart.splice(i, 1); c.innerHTML = billHTML(); };
  window.billDiscount  = (v) => { discount = v; c.innerHTML = billHTML(); };
  window.billPayMode   = (m) => { payMode = m; c.innerHTML = billHTML(); };
  window.toggleRedeem  = (v) => { redeemPoints = v; c.innerHTML = billHTML(); };
  window.billClear     = ()  => { cart = []; customer = null; discount = 0; redeemPoints = false; payMode = 'Cash'; c.innerHTML = billHTML(); };
  window.billClearCustomer = () => { customer = null; redeemPoints = false; c.innerHTML = billHTML(); };

  window.custSearch = async (q) => {
    if (q.length < 1) { document.getElementById('cust-drop').style.display = 'none'; return; }
    const custs = await GET('/customers?q=' + encodeURIComponent(q));
    const drop  = document.getElementById('cust-drop');
    drop.innerHTML = [
      ...custs.map(cu => `<div class="search-item" onclick="billSetCustomer(${cu.id},'${cu.name.replace(/'/g,"\\'")}','${cu.phone || ''}',${cu.loyalty_points || 0})">${cu.name} <span style="color:var(--muted);font-size:11px">— ${cu.phone || ''}</span></div>`),
      `<div class="search-item" style="color:var(--accent)" onclick="billWalkIn('${q.replace(/'/g,"\\'")}')">+ Add "${q}" as patient</div>`
    ].join('');
    drop.style.display = 'block';
  };

  window.billSetCustomer = (id, name, phone, pts) => { customer = { id, name, phone, loyalty_points: pts }; c.innerHTML = billHTML(); };
  window.billWalkIn = (name) => { customer = { id: null, name, phone: '', loyalty_points: 0, walkIn: true }; c.innerHTML = billHTML(); };

  window.uploadRx = async (file) => {
    if (!file) return;
    const st = document.getElementById('rx-upload-status');
    st.textContent = 'Uploading...';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/prescriptions/upload', {
        method: 'POST', headers: { 'X-Token': window.APP ? (localStorage.getItem('token') || '') : '' },
        body: fd
      });
      if (!r.ok) throw new Error('Upload failed');
      const d = await r.json();
      document.getElementById('bill-rx-path').value = d.image_path;
      st.innerHTML = `<span style="color:var(--green)">✓ Uploaded successfully</span>`;
    } catch (e) {
      st.innerHTML = `<span style="color:var(--danger)">✗ ${e.message}</span>`;
    }
  };

  window.billGenerate = async () => {
    if (!cart.length) return toast('Cart is empty', 'error');
    if (payMode === 'Credit' && !customer) return toast('Customer required for Credit payment', 'error');
    
    document.getElementById('bill-gen-btn').textContent = 'Generating...';
    document.getElementById('bill-gen-btn').disabled = true;

    const dr   = document.getElementById('bill-doctor')?.value.trim() || '';
    const rx   = document.getElementById('bill-rx')?.value.trim() || '';
    const name = customer ? customer.name : (document.getElementById('cust-search')?.value.trim() || '');
    const rxPath = document.getElementById('bill-rx-path')?.value || '';
    const ptsRedeemed = (customer && redeemPoints) ? customer.loyalty_points : 0;

    try {
      const b = await POST('/bills', {
        customer_id: customer?.id || null,
        patient_name: name, doctor: dr, rx_no: rx, rx_image_path: rxPath,
        discount_pct: discount, payment_mode: payMode, points_redeemed: ptsRedeemed,
        items: cart.map(i => ({ drug_id: i.id, tablets_qty: i.qty }))
      });
      
      window._lastBillData = { res: b, items: [...cart], cust: customer, disc: discount, pay: payMode };
      
      modal(`✅ Transaction Complete: ${b.bill_no}`, `
        <div style="text-align:center;padding:24px 0">
          <div style="font-size:36px;margin-bottom:12px">🧾</div>
          <div style="font-weight:800;font-size:18px;color:var(--accent)">₹${b.total.toFixed(2)} Collected</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">Payment Mode: ${payMode}</div>
        </div>
      `, `
        <button class="btn btn-outline" style="flex:0.8" onclick="closeModal(); APP.navigate('dashboard')">Skip Print</button>
        <button class="btn btn-outline" style="flex:1" onclick="printChallan(window._lastBillData); closeModal(); APP.navigate('dashboard')">🚗 Print Challan</button>
        <button class="btn btn-primary" style="flex:1.2" onclick="printBill(window._lastBillData); closeModal(); APP.navigate('dashboard')">🖨️ Print Bill</button>
      `);
    } catch (e) {
      toast(e.message, 'error');
      document.getElementById('bill-gen-btn').textContent = 'Generate Bill';
      document.getElementById('bill-gen-btn').disabled = false;
    }
  };
  
  // Keyboard Wedge Barcode Scanner Listener
  let barcodeBuf = "";
  let barcodeTimer = null;
  c._lb_cleanup = () => { window.removeEventListener('keydown', handleBarcode); };
  
  function handleBarcode(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Enter') {
      if (barcodeBuf.length > 3) {
        // Look up drug by barcode
        GET('/scan/barcode?code=' + encodeURIComponent(barcodeBuf)).then(r => {
          if (r.ok && r.drug) billAddDrug(r.drug.id);
          else toast('Barcode not found: ' + barcodeBuf, 'warn');
        }).catch(err => {
          toast('Barcode search error', 'error');
        });
      }
      barcodeBuf = "";
      clearTimeout(barcodeTimer);
      return;
    }
    if (e.key.length === 1) {
      barcodeBuf += e.key;
      clearTimeout(barcodeTimer);
      barcodeTimer = setTimeout(() => { barcodeBuf = ""; }, 50); // wedge scanners type fast
    }
  }
  window.addEventListener('keydown', handleBarcode);

  function printBill(data) {
    const { res, items, cust, disc, pay } = data;
    const subtotal = items.reduce((s, i) => s + i.qty * i.mrp_per_tablet, 0);
    const discAmt  = subtotal * disc / 100;
    const gst      = (subtotal - discAmt) * 0.12;
    const w = window.open('', '_blank', 'width=400,height=600');
    w.document.write(`<html><head><title>Bill ${res.bill_no}</title>
    <style>body{font-family:monospace;padding:16px;color:#111;font-size:13px}
    .row{display:flex;justify-content:space-between}hr{border:none;border-top:1px dashed #999;margin:8px 0}
    .big{font-size:18px;font-weight:900}table{width:100%;border-collapse:collapse}
    td,th{padding:3px 4px;text-align:left}th{border-bottom:1px solid #ccc;font-size:11px}</style>
    </head><body>
    <div style="text-align:center;margin-bottom:12px">
      <div class="big">PharmaPro</div>
      <div style="font-size:11px;color:#666">${new Date().toLocaleString('en-IN')}</div>
      <div style="font-size:11px">Bill No: <b>${res.bill_no}</b></div>
      ${cust ? `<div style="font-size:11px">Patient: ${cust.name}</div>` : ''}
    </div>
    <hr>
    <table><thead><tr><th>Medicine</th><th>Qty</th><th>Rate</th><th style="text-align:right">Amt</th></tr></thead>
    <tbody>${items.map(i => {
      let activeQty = i.qty;
      let isBogo = i.offer_type === 'BOGO';
      if (isBogo) activeQty = i.qty - Math.floor(i.qty / 2);
      return `<tr><td>${i.name} ${isBogo ? '(BOGO)' : ''}<br><span style="font-size:10px;color:#666">${i.brand || ''}</span></td><td>${i.qty}</td><td>₹${i.mrp_per_tablet.toFixed(2)}</td><td style="text-align:right">₹${(activeQty * i.mrp_per_tablet).toFixed(2)}</td></tr>`;
    }).join('')}
    </tbody></table>
    <hr>
    <div class="row"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
    ${disc > 0 ? `<div class="row"><span>Discount (${disc}%)</span><span>-₹${discAmt.toFixed(2)}</span></div>` : ''}
    <div class="row"><span>GST (12%)</span><span>₹${gst.toFixed(2)}</span></div>
    <div class="row big" style="margin-top:6px"><span>TOTAL</span><span>₹${res.total.toFixed(2)}</span></div>
    <div style="font-size:11px;color:#666;margin-top:4px">Payment: ${pay}</div>
    <hr><div style="text-align:center;font-size:11px;color:#666;margin-top:8px">Thank you! Get well soon. 💊</div>
    <script>window.print();window.close();<\/script></body></html>`);
  }

  window.printChallan = (data) => {
    const { res, items, cust } = data;
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<html><head><title>DELIVERY CHALLAN ${res.bill_no}</title>
    <style>body{font-family:sans-serif;padding:24px;color:#111;font-size:13px}
    .row{display:flex;justify-content:space-between}hr{border-top:1px solid #111;margin:16px 0}
    .big{font-size:24px;font-weight:900}table{width:100%;border-collapse:collapse;margin-top:20px}
    td,th{padding:8px;border:1px solid #666;text-align:left}th{background:#eee}</style>
    </head><body>
    <div style="text-align:center;margin-bottom:20px">
      <div class="big">DELIVERY CHALLAN / DISPATCH NOTE</div>
      <div style="font-size:12px;color:#666">Not for ITC (Non-Tax Invoice)</div>
    </div>
    <div class="row">
      <div>
        <b>Supplier:</b> PharmaPro Retail<br/>
        Date: ${new Date().toLocaleString('en-IN')}<br/>
        Reference Bill: ${res.bill_no}
      </div>
      <div style="text-align:right">
        <b>To:</b> ${cust ? cust.name : 'Walk-in / General'}<br/>
        Contact: ${cust ? (cust.phone || 'N/A') : 'N/A'}
      </div>
    </div>
    <table><thead><tr><th>S.No</th><th>Description of Goods (Medicine)</th><th>Composition / Batch Info</th><th>Dispatch Qty (Tablets)</th></tr></thead>
    <tbody>${items.map((i, idx) => `<tr>
      <td style="width:50px">${idx + 1}</td>
      <td><b>${i.name}</b><br/><span style="font-size:11px">${i.brand || ''}</span></td>
      <td style="font-size:11px">${i.composition || 'N/A'}<br/>HSN: ${i.hsn || ''}</td>
      <td style="font-size:14px;font-weight:700;text-align:center">${i.qty}</td>
      </tr>`).join('')}
    </tbody></table>
    <div style="margin-top:40px;display:flex;justify-content:space-between">
      <div style="border-top:1px solid #000;padding-top:4px;width:200px;text-align:center">Transporter / Vehicle Sign</div>
      <div style="border-top:1px solid #000;padding-top:4px;width:200px;text-align:center">Receiver Signature</div>
    </div>
    <script>window.print();window.close();<\/script></body></html>`);
  }
}
