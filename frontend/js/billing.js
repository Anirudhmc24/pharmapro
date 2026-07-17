// billing.js — Billing page with FEFO, print, and customer search
import { GET, POST } from './api.js';
import { fmt, fmtI, tag, stripVis, toast, modal, closeModal } from './utils.js';
import { showSubstitutesModal } from './substitutes.js';

// Module-level persistent state (persists across navigations)
let bills = [];
let activeBillId = null;
let nextBillSeq = 1;

function addBillTab() {
  if (bills.length >= 10) {
    toast('Maximum limit of 10 bills on hold reached. Please clear, complete, or close existing bills first.', 'error');
    return null;
  }
  const newId = nextBillSeq++;
  const newBill = {
    id: newId,
    name: `Bill ${newId}`,
    cart: [],
    customer: null,
    discount: 0,
    payMode: 'Cash',
    redeemPoints: false,
    gstInclusive: true,
    doctor: '',
    rxNo: '',
    rxPath: '',
    rxFileName: '',
    interactions: []
  };
  bills.push(newBill);
  activeBillId = newId;
  return newBill;
}

export async function renderBilling(c, APP) {
  if (bills.length === 0) {
    addBillTab();
  }

  const getActiveBill = () => {
    let b = bills.find(x => x.id === activeBillId);
    if (!b) {
      if (bills.length === 0) addBillTab();
      b = bills[0];
      activeBillId = b.id;
    }
    return b;
  };

  let cart, customer, discount, payMode, redeemPoints, gstInclusive;
  let interactions;

  function loadActiveBillState() {
    const b = getActiveBill();
    cart = b.cart;
    customer = b.customer;
    discount = b.discount;
    payMode = b.payMode;
    redeemPoints = b.redeemPoints;
    gstInclusive = b.gstInclusive;
    interactions = b.interactions || [];
  }

  function saveActiveBillState() {
    const b = getActiveBill();
    b.cart = cart;
    b.customer = customer;
    b.discount = discount;
    b.payMode = payMode;
    b.redeemPoints = redeemPoints;
    b.gstInclusive = gstInclusive;
    b.interactions = interactions;
    
    // Save current input field values to the active bill state object
    const docEl = document.getElementById('bill-doctor');
    const rxEl = document.getElementById('bill-rx');
    const rxPathEl = document.getElementById('bill-rx-path');
    if (docEl) b.doctor = docEl.value.trim();
    if (rxEl) b.rxNo = rxEl.value.trim();
    if (rxPathEl) b.rxPath = rxPathEl.value;
  }

  // Load state upon initial render
  loadActiveBillState();

  window.toggleRedeem = (checked) => { redeemPoints = checked; window.billApplyState(); };
  window.toggleGstInclusive = (checked) => { gstInclusive = checked; window.billApplyState(); };
  
  window.checkInteractionsAsync = async () => {
    if (cart.length < 2) {
      if (interactions.length > 0) {
        interactions = [];
        getActiveBill().interactions = [];
        c.innerHTML = billHTML();
      }
      return;
    }
    const ids = cart.map(i => i.id).join(',');
    const res = await GET(`/drugs/check_interactions?drug_ids=${ids}`);
    if (JSON.stringify(res) !== JSON.stringify(interactions)) {
      interactions = res;
      getActiveBill().interactions = res;
      c.innerHTML = billHTML();
    }
  };

  window.billApplyState = () => {
    saveActiveBillState();
    c.innerHTML = billHTML();
    window.checkInteractionsAsync();
  };

  window.switchBill = (billId) => {
    saveActiveBillState();
    activeBillId = billId;
    loadActiveBillState();
    window.billApplyState();
  };

  window.addBillTab = () => {
    saveActiveBillState();
    const newBill = addBillTab();
    if (newBill) {
      loadActiveBillState();
      window.billApplyState();
    }
  };

  window.closeBill = (billId) => {
    saveActiveBillState();
    bills = bills.filter(x => x.id !== billId);
    if (bills.length === 0) {
      addBillTab();
    } else if (activeBillId === billId) {
      activeBillId = bills[0].id;
    }
    loadActiveBillState();
    window.billApplyState();
  };

  window.updateBillField = (field, value) => {
    const b = getActiveBill();
    if (field === 'doctor') b.doctor = value;
    if (field === 'rxNo') b.rxNo = value;
  };

  function billHTML() {
    const activeBill = getActiveBill();
    const ptsRedeemed = (customer && redeemPoints) ? customer.loyalty_points : 0;
    const subtotal = cart.reduce((s, item) => {
      let activeQty = item.qty;
      if (item.offer_type === 'BOGO') {
        activeQty = item.qty - Math.floor(item.qty / 2);
      }
      return s + activeQty * item.mrp_per_tablet;
    }, 0);
    const pctDiscAmt = subtotal * discount / 100;
    const discAmt  = pctDiscAmt + (ptsRedeemed * 0.01);
    const gst      = gstInclusive ? 0 : Math.max(0, (subtotal - discAmt) * 0.12);
    const total    = Math.max(0, subtotal - discAmt + (gstInclusive ? 0 : gst));
    const summaryLines = [
      ['Subtotal', fmt(subtotal)],
      ['Discount', discount + '%'],
      ['Disc. Amount', '− ' + fmt(discAmt)]
    ];
    if (!gstInclusive) {
      summaryLines.push(['GST (12%)', '+' + fmt(gst)]);
    }

    const tabsHtml = `
      <div class="bill-tabs" style="display:flex; align-items:center; gap:6px; margin: 4px 0 16px 0; padding-bottom:10px; border-bottom:1px solid var(--border); overflow-x:auto; flex-wrap:nowrap; -webkit-overflow-scrolling:touch;">
        ${bills.map((b, idx) => {
          const isActive = b.id === activeBillId;
          const label = b.customer ? b.customer.name : (b.doctor ? `Dr. ${b.doctor.split(' ')[0]}` : `Bill ${idx + 1}`);
          return `
            <div onclick="window.switchBill(${b.id})" style="
              display:inline-flex; align-items:center; gap:8px; 
              padding:6px 12px; border-radius:6px; 
              cursor:pointer; font-weight:700; font-size:12px;
              border:1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};
              background:${isActive ? 'var(--accent-dim)' : 'var(--surface)'};
              color:${isActive ? 'var(--accent)' : 'var(--text)'};
              transition: all 0.15s; white-space:nowrap;
            ">
              <span>${label}</span>
              ${bills.length > 1 ? `
                <span onclick="event.stopPropagation(); window.closeBill(${b.id})" style="
                  color:var(--danger); font-size:11px; cursor:pointer; 
                  display:inline-flex; align-items:center; justify-content:center;
                  width:14px; height:14px; border-radius:50%; margin-left:4px;
                " onmouseover="this.style.background='var(--danger-dim)'" onmouseout="this.style.background='transparent'">✕</span>
              ` : ''}
            </div>
          `;
        }).join('')}
        <button class="btn btn-outline btn-sm" onclick="window.addBillTab()" style="padding:4px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; font-size:12px; margin-left:8px; height: 28px; white-space:nowrap;">
          <span>➕</span> <span>Hold & New (Alt+N)</span>
        </button>
      </div>
    `;

    return `
    <div style="display:flex; flex-direction:column; height:calc(100vh - 130px)">
      ${tabsHtml}
      <div style="display:grid;grid-template-columns:1fr 340px;gap:18px;flex:1;overflow:hidden" class="billing-layout">
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
            <button class="btn btn-outline" onclick="window.showKeyboardShortcutsHandbook()" style="white-space:nowrap; padding:9px 14px; display:flex; align-items:center; gap:6px;" title="Keyboard Shortcuts (Alt+K)">
              <span>⌨️</span> <span>Shortcuts</span>
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
                      <div style="font-size:11px;color:var(--muted)">${item.brand || ''} · ${tag(item.schedule === 'Rx' ? 'Rx' : 'OTC', item.schedule === 'Rx' ? 'tag-red' : 'tag-green')} · Cost: <b>₹${item.cost_per_strip || (item.batches && item.batches.length ? item.batches[0].cost_per_strip : 0)}</b>/strip</div></td>
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
            <div class="section-title">Customer & Prescription</div>
            ${customer ? `
              <div class="flex-between" style="align-items:flex-start">
                <div style="flex:1">
                  <div style="font-weight:700">${customer.name}</div>
                  ${customer.id === null ? `
                    <div class="field" style="margin-top:6px;margin-bottom:0">
                      <label style="font-size:10px;margin-bottom:2px">Phone Number</label>
                      <input class="input" id="cust-walkin-phone" placeholder="10-digit number" value="${customer.phone || ''}" oninput="window.setWalkinPhone(this.value)" type="tel" style="font-size:12px;padding:4px 8px">
                    </div>
                  ` : `
                    <div style="font-size:11px;color:var(--muted)">${customer.phone || 'No phone'} · 🎯 ${customer.loyalty_points || 0} pts ${customer.agreed_discount > 0 ? `· 🏷️ ${customer.agreed_discount}% Off` : ''}</div>
                    ${customer.custom_id ? `<div style="font-size:10px;color:var(--muted);font-family:monospace;margin-top:2px">ID: ${customer.custom_id}</div>` : ''}
                  `}
                </div>
                <button style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0 4px" onclick="billClearCustomer()">✕</button>
              </div>
            ` : `
            <div class="search-wrap">
              <span class="search-icon">👤</span>
              <input class="input" id="cust-search" placeholder="Search by name, phone or ID…" autocomplete="off" oninput="custSearch(this.value)">
              <div class="search-drop" id="cust-drop" style="display:none"></div>
            </div>`}
            
            <div style="display:flex;gap:12px;margin-top:12px">
              <div class="field" style="flex:1"><label>Doctor</label>
                <input class="input" id="bill-doctor" placeholder="Dr. Name" value="${activeBill.doctor || ''}" oninput="window.updateBillField('doctor', this.value)"></div>
              <div class="field"><label>Rx No</label>
                <input class="input" id="bill-rx" placeholder="Optional" value="${activeBill.rxNo || ''}" oninput="window.updateBillField('rxNo', this.value)"></div>
            </div>
            <div class="field" style="margin-top:12px">
              <label>Upload Prescription (Image)</label>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button type="button" class="btn btn-outline btn-sm" onclick="var f=document.getElementById('bill-rx-file');f.value='';f.click()">📷 Choose Image</button>
                <span id="rx-file-name" style="font-size:11px;color:var(--muted)">${activeBill.rxFileName || ''}</span>
              </div>
              <input type="file" id="bill-rx-file" accept="image/*" capture="environment" class="file-input-hidden" onchange="uploadRx(this.files[0]); var nameEl=document.getElementById('rx-file-name'); if(nameEl && this.files[0]) nameEl.textContent=this.files[0].name">
              <input type="hidden" id="bill-rx-path" value="${activeBill.rxPath || ''}">
              <div id="rx-upload-status" style="font-size:11px;color:var(--muted);margin-top:4px"></div>
            </div>
          </div>
  
          <div class="card" style="flex:1">
            <div class="section-title">Bill Summary</div>
            <div class="gap-12">
              ${summaryLines.map(([k, v]) =>
                `<div class="flex-between" style="font-size:13px;color:var(--muted)"><span>${k}</span><span style="color:var(--text)">${v}</span></div>`
              ).join('')}
              <div class="flex-between" style="font-size:20px;font-weight:900;border-top:1px solid var(--border);padding-top:10px">
                <span>Total</span><span style="color:var(--accent)">${fmtI(total)}</span>
              </div>
            </div>
            <div class="field" style="margin-top:14px"><label>Discount %</label>
              <input class="input" type="number" min="0" max="30" value="${discount}" oninput="billDiscount(+this.value)"/>
              <div style="margin-top:8px;display:flex;align-items:center;gap:6px;">
                <input type="checkbox" id="gst-inclusive-cb" ${gstInclusive ? 'checked' : ''} onchange="toggleGstInclusive(this.checked)" style="width:16px;height:16px;accent-color:var(--accent)"/>
                <label for="gst-inclusive-cb" style="cursor:pointer;font-weight:700;color:var(--accent)">Prices include GST</label>
              </div>
            </div>
            ${customer && customer.loyalty_points > 0 ? `
            <div style="margin-top:12px;display:flex;align-items:center;gap:8px;font-size:13px;padding:8px;background:var(--accent-dim);border-radius:6px;border:1px solid var(--accent)">
              <input type="checkbox" id="redeem-cb" ${redeemPoints ? 'checked' : ''} onchange="toggleRedeem(this.checked)" style="width:16px;height:16px;accent-color:var(--accent)">
              <label for="redeem-cb" style="cursor:pointer;font-weight:700;color:var(--accent)">Redeem ${customer.loyalty_points} Points (− ₹${(customer.loyalty_points * 0.01).toFixed(2)})</label>
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
      </div>
    </div>

    <!-- Quick Bill Calculator -->
    <style>
      #quick-calc-details {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
        width: 48px;
        height: 48px;
        transition: width 0.2s ease, height 0.2s ease;
        overflow: hidden;
      }
      #quick-calc-details[open] {
        width: 380px;
        height: auto;
      }
      #quick-calc-details summary::-webkit-details-marker {
        display: none !important;
      }
      #quick-calc-details summary {
        list-style: none !important;
        outline: none;
      }
      #quick-calc-details:not([open]) summary {
        justify-content: center !important;
      }
      #quick-calc-details:not([open]) .calc-summary-text,
      #quick-calc-details:not([open]) .calc-summary-hint {
        display: none !important;
      }
      #quick-calc-details[open] .calc-summary-text {
        display: inline-block !important;
      }
      #quick-calc-details[open] .calc-summary-hint {
        display: inline-block !important;
      }
      #quick-calc-details[open] summary {
        justify-content: flex-start !important;
        border-bottom: 1px solid var(--border);
      }
    </style>
    <details id="quick-calc-details" ${window._calcOpen ? 'open' : ''}>
      <summary onclick="window._calcOpen = !document.getElementById('quick-calc-details').open"
        style="cursor:pointer;display:flex;align-items:center;
          width:100%;height:48px;color:var(--accent);
          user-select:none;transition:background .15s;padding:0;"
        onmouseover="this.style.background='var(--accent-dim)'"
        onmouseout="this.style.background='var(--surface)'">
        <span style="font-size:22px;display:flex;align-items:center;justify-content:center;width:48px;height:48px;flex-shrink:0;">🧮</span>
        <span class="calc-summary-text" style="display:none;font-weight:700;">Calculator</span>
        <span class="calc-summary-hint" style="margin-left:auto;font-size:11px;color:var(--muted);font-weight:400;display:none;padding-right:16px;">MRP + discount → total</span>
      </summary>
      <div style="padding:14px 16px;background:var(--surface)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px" class="calc-row">
          <div class="field" style="margin:0">
            <label style="font-size:11px;font-weight:700">MRP (₹)</label>
            <input class="input" id="calc-mrp" type="number" min="0" step="0.01" placeholder="e.g. 100"
              oninput="window.runQuickCalc()">
          </div>
          <div class="field" style="margin:0">
            <label style="font-size:11px;font-weight:700">Discount (%)</label>
            <input class="input" id="calc-disc" type="number" min="0" max="100" step="0.1" placeholder="e.g. 10"
              oninput="window.runQuickCalc()">
          </div>
          <div class="field" style="margin:0">
            <label style="font-size:11px;font-weight:700">GST (%)</label>
            <input class="input" id="calc-gst" type="number" min="0" max="28" step="0.5" placeholder="12 (if excl)"
              oninput="window.runQuickCalc()">
          </div>
          <div style="display:flex;align-items:center;justify-content:center;padding-top:14px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;cursor:pointer;font-weight:700;color:var(--accent)">
              <input type="checkbox" id="calc-inclusive" checked onchange="window.runQuickCalc()"
                style="width:16px;height:16px;accent-color:var(--accent)">
              GST Incl.
            </label>
          </div>
        </div>
        <div id="calc-result" style="margin-top:12px;display:none;padding:12px;
          background:var(--accent-dim);border-radius:8px;border:1px solid var(--accent)">
        </div>
      </div>
    </details>
    </div>`;
  }

  c.innerHTML = billHTML();

  window.runQuickCalc = () => {
    const mrp       = parseFloat(document.getElementById('calc-mrp')?.value) || 0;
    const discPct   = parseFloat(document.getElementById('calc-disc')?.value) || 0;
    const gstPct    = parseFloat(document.getElementById('calc-gst')?.value) || 0;
    const inclusive = document.getElementById('calc-inclusive')?.checked ?? true;
    const out       = document.getElementById('calc-result');
    if (!out) return;

    if (mrp <= 0) { out.style.display = 'none'; return; }

    const discAmt = Math.round(mrp * discPct / 100 * 100) / 100;
    const afterDisc = Math.round((mrp - discAmt) * 100) / 100;

    let gstAmt = 0, finalTotal = afterDisc;
    if (gstPct > 0) {
      if (inclusive) {
        // GST already baked in — back-calculate
        gstAmt = Math.round(afterDisc * gstPct / (100 + gstPct) * 100) / 100;
      } else {
        gstAmt = Math.round(afterDisc * gstPct / 100 * 100) / 100;
        finalTotal = Math.round((afterDisc + gstAmt) * 100) / 100;
      }
    }

    const rows = [
      ['MRP',                `₹${mrp.toFixed(2)}`],
      [`Discount (${discPct}%)`, `− ₹${discAmt.toFixed(2)}`],
      ...(gstPct > 0 ? [[`GST ${gstPct}% (${inclusive ? 'incl.' : 'excl.'})`, `${inclusive ? '(incl.)' : '+ ₹' + gstAmt.toFixed(2)}`]] : []),
    ];

    out.style.display = 'block';
    out.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto;gap:4px 16px;font-size:13px;color:var(--muted)">
        ${rows.map(([k, v]) => `<span>${k}</span><span style="text-align:right;font-weight:600;color:var(--text)">${v}</span>`).join('')}
        <div style="grid-column:1/-1;border-top:1px solid var(--accent);margin:6px 0"></div>
        <span style="font-weight:900;font-size:16px;color:var(--accent)">Amount Payable</span>
        <span style="text-align:right;font-weight:900;font-size:18px;color:var(--accent)">₹${finalTotal.toFixed(2)}</span>
        ${gstPct > 0 && inclusive ? `<span style="grid-column:1/-1;font-size:10px;color:var(--muted);margin-top:2px">GST of ₹${gstAmt.toFixed(2)} already included in the above amount</span>` : ''}
      </div>`;
  };

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
            <div style="font-size:11px;color:var(--muted);margin-top:2px">Box ${d.box_id || '?'} · Stock: <b style="color:${outOfStock ? 'var(--danger)' : 'var(--accent)'}">${d.stock_tablets || 0}</b> ${(d.pack_type || 'Strip').toLowerCase()}s · Cost: <b>₹${d.cost_per_strip || 0}</b>/strip · ${tag(d.schedule === 'Rx' ? '℞ Rx' : 'OTC', d.schedule === 'Rx' ? 'tag-red' : 'tag-green')}${outOfStock ? ' · <span style="color:var(--warn);font-weight:700">⚠️ Out of Stock</span>' : ''}</div>
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
      ...custs.map(cu => {
        const idLabel = cu.custom_id ? ` (ID: ${cu.custom_id})` : '';
        const args = `${cu.id},'${cu.name.replace(/'/g,"\\'")}','${cu.phone || ''}',${cu.loyalty_points || 0},${cu.agreed_discount || 0},'${cu.custom_id || ''}'`;
        return `<div class="search-item" onclick="billSetCustomer(${args})">${cu.name}${idLabel} <span style="color:var(--muted);font-size:11px">— ${cu.phone || ''}</span></div>`;
      }),
      `<div class="search-item" style="color:var(--accent)" onclick="billWalkIn('${q.replace(/'/g,"\\'")}')">+ Add "${q}" as patient</div>`
    ].join('');
    drop.style.display = 'block';
  };

  window.billSetCustomer = (id, name, phone, pts, disc, customId) => { 
    customer = { id, name, phone, loyalty_points: pts, agreed_discount: disc, custom_id: customId }; 
    if (disc > 0) {
      discount = disc;
    }
    c.innerHTML = billHTML(); 
  };
  
  window.billWalkIn = (name) => { customer = { id: null, name, phone: '', loyalty_points: 0, agreed_discount: 0, walkIn: true }; c.innerHTML = billHTML(); };
  
  window.setWalkinPhone = (val) => {
    if (customer) {
      customer.phone = val;
    }
  };

  window.uploadRx = async (file) => {
    if (!file) return;
    const st = document.getElementById('rx-upload-status');
    st.textContent = 'Uploading...';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/prescriptions/upload', {
        method: 'POST', headers: { 'X-Token': window.APP ? (localStorage.getItem('pp_token') || '') : '' },
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
        phone: customer?.phone || '',
        patient_name: name, doctor: dr, rx_no: rx, rx_image_path: rxPath,
        discount_pct: discount, payment_mode: payMode, points_redeemed: ptsRedeemed,
        gst_inclusive: gstInclusive,
        items: cart.map(i => ({ drug_id: i.id, tablets_qty: i.qty }))
      });
      
      const fullBill = await GET('/bills/' + b.bill_id);
      window._lastBillData = { res: fullBill, items: fullBill.items, cust: customer, disc: fullBill.discount_pct, pay: fullBill.payment_mode };
      
      // Close the successfully generated bill tab
      const currentId = activeBillId;
      bills = bills.filter(x => x.id !== currentId);
      if (bills.length === 0) {
        addBillTab();
      } else {
        activeBillId = bills[0].id;
      }
      loadActiveBillState();

      modal(`✅ Transaction Complete: ${b.bill_no}`, `
        <div style="text-align:center;padding:24px 0">
          <div style="font-size:36px;margin-bottom:12px">🧾</div>
          <div style="font-weight:800;font-size:18px;color:var(--accent)">₹${b.total.toFixed(2)} Collected</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">Payment Mode: ${payMode}</div>
        </div>
      `, `
        <button class="btn btn-outline" style="flex:0.8" onclick="closeModal(); APP.navigate('dashboard')">Skip Print</button>
        <button class="btn btn-outline" style="flex:1; border-color:#25d366; color:#25d366" onclick="showWhatsappModal(window._lastBillData)">💬 WhatsApp</button>
        <button class="btn btn-outline" style="flex:1" onclick="printChallan(window._lastBillData); closeModal(); APP.navigate('dashboard')">🚗 Print Challan</button>
        <button class="btn btn-primary" style="flex:1.2" onclick="printBill(window._lastBillData); closeModal(); APP.navigate('dashboard')">🖨️ Print Bill</button>
      `);
    } catch (e) {
      toast(e.message, 'error');
      document.getElementById('bill-gen-btn').textContent = 'Generate Bill';
      document.getElementById('bill-gen-btn').disabled = false;
    }
  };

  window.showWhatsappModal = (data) => {
    const prefillName = data.cust?.name || data.res?.patient_name || '';
    const prefillPhone = data.cust?.phone || '';
    
    modal(`💬 Send Bill via WhatsApp`, `
      <div class="field">
        <label>Customer/Patient Name *</label>
        <input class="input" id="wa-name" value="${prefillName}" placeholder="Enter name">
      </div>
      <div class="field" style="margin-top:10px">
        <label>WhatsApp / Mobile Number *</label>
        <input class="input" id="wa-phone" value="${prefillPhone}" placeholder="10-digit mobile number, e.g. 9876543210" type="tel">
      </div>
    `, `
      <button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:1.5; background:#25d366; border-color:#25d366; color:#fff" onclick="sendBillWhatsapp(${data.res.id}, '${data.res.bill_no}', ${data.res.total}, '${data.res.payment_mode}')">🟢 Send Bill</button>
    `);
  };

  window.sendBillWhatsapp = async (billId, billNo, total, paymentMode) => {
    const name = document.getElementById('wa-name')?.value?.trim();
    let phone = document.getElementById('wa-phone')?.value?.trim();
    
    if (!name || !phone) { toast('Name and Phone number are required', 'error'); return; }
    
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.length < 10) { toast('Please enter a valid mobile number', 'error'); return; }
    
    const waPhone = phone.length === 10 ? '91' + phone : phone;
    
    try {
      // Check if this phone number already exists in customers
      const existing = await GET('/customers?q=' + encodeURIComponent(phone));
      const match = existing.find(c => c.phone && c.phone.replace(/[^0-9]/g, '') === phone);
      
      if (!match) {
        // Create new customer in the database
        await POST('/customers', { name: name, phone: phone, dob: '' });
        toast('Added new customer to database ✅', 'info');
      }
      
      const msg = `Thank you for your purchase in Shrivari Medicals! Here is your invoice no ${billNo} amounting to Rs. ${total.toFixed(2)}.`;
      const pdfUrl = `${window.location.origin}/api/bills/${billId}/pdf`;
      
      if (window.AndroidBridge && window.AndroidBridge.shareBillPdf) {
        window.AndroidBridge.shareBillPdf(pdfUrl, waPhone, msg);
      } else {
        const waUrl = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(msg)}`;
        if (window.AndroidBridge && window.AndroidBridge.openExternalUrl) {
          window.AndroidBridge.openExternalUrl(waUrl);
        } else {
          window.open(waUrl, '_blank');
        }
      }
      
      closeModal();
      APP.navigate('dashboard');
    } catch (err) {
      console.error(err);
      toast('Error: ' + err.message, 'error');
    }
  };

  window.shareBillOnWhatsapp = (billId, patientName, billNo, total, customerPhone) => {
    let phone = (customerPhone || '').replace(/\D/g, '');
    if (!phone) {
      phone = prompt("This bill does not have a customer phone number linked. Enter a 10-digit phone number to send via WhatsApp:");
      if (!phone) return;
      phone = phone.replace(/\D/g, '');
    }
    if (phone.length < 10) {
      alert("Please enter a valid 10-digit mobile number.");
      return;
    }
    const waPhone = phone.length === 10 ? '91' + phone : phone;
    const msg = `Thank you for your purchase in Shrivari Medicals! Here is your invoice no ${billNo} amounting to Rs. ${total.toFixed(2)}.`;
    const pdfUrl = `${window.location.origin}/api/bills/${billId}/pdf`;
    
    if (window.AndroidBridge && window.AndroidBridge.shareBillPdf) {
      window.AndroidBridge.shareBillPdf(pdfUrl, waPhone, msg);
    } else {
      const waUrl = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(msg)}`;
      if (window.AndroidBridge && window.AndroidBridge.openExternalUrl) {
        window.AndroidBridge.openExternalUrl(waUrl);
      } else {
        window.open(waUrl, '_blank');
      }
    }
  };
  
  // Keyboard Wedge Barcode Scanner Listener & Billing Shortcuts
  let barcodeBuf = "";
  let barcodeTimer = null;
  
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

  function handleBillingShortcuts(e) {
    if (!e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'k') {
      e.preventDefault();
      window.showKeyboardShortcutsHandbook();
    } else if (key === 'n') {
      e.preventDefault();
      window.addBillTab();
    } else if (key === 'w') {
      e.preventDefault();
      if (bills.length > 1) {
        window.closeBill(activeBillId);
      } else {
        toast('Cannot close the only active bill', 'warn');
      }
    } else if (key === 's') {
      e.preventDefault();
      const el = document.getElementById('bill-search');
      if (el) {
        el.focus();
        el.select();
      }
    } else if (key === 'c') {
      e.preventDefault();
      if (confirm('Are you sure you want to clear current bill?')) {
        window.billClear();
      }
    } else if (key === 'g' || e.key === 'Enter') {
      e.preventDefault();
      window.billGenerate();
    } else if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (idx < bills.length) {
        e.preventDefault();
        window.switchBill(bills[idx].id);
      }
    }
  }

  window.showKeyboardShortcutsHandbook = () => {
    const modalHtml = `
      <div style="font-family: inherit; font-size:14px; line-height: 1.6; color: var(--text);">
        <p style="color: var(--muted); margin-bottom: 16px; font-size:12px;">Use these keys at any time to navigate the billing screen quickly.</p>
        <table class="tbl" style="margin-bottom: 12px; width: 100%;">
          <thead>
            <tr>
              <th style="padding: 6px 12px; text-align: left;">Shortcut</th>
              <th style="padding: 6px 12px; text-align: left;">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><kbd style="background:var(--border); padding:2px 6px; border-radius:4px; font-weight:700;">Alt + N</kbd></td><td>Hold current bill & start new bill</td></tr>
            <tr><td><kbd style="background:var(--border); padding:2px 6px; border-radius:4px; font-weight:700;">Alt + W</kbd></td><td>Close current bill tab</td></tr>
            <tr><td><kbd style="background:var(--border); padding:2px 6px; border-radius:4px; font-weight:700;">Alt + [1-9]</kbd></td><td>Switch directly to tab 1 - 9</td></tr>
            <tr><td><kbd style="background:var(--border); padding:2px 6px; border-radius:4px; font-weight:700;">Alt + S</kbd></td><td>Focus medicine search input</td></tr>
            <tr><td><kbd style="background:var(--border); padding:2px 6px; border-radius:4px; font-weight:700;">Alt + C</kbd></td><td>Clear current bill (cart & patient)</td></tr>
            <tr><td><kbd style="background:var(--border); padding:2px 6px; border-radius:4px; font-weight:700;">Alt + G</kbd> or <kbd style="background:var(--border); padding:2px 6px; border-radius:4px; font-weight:700;">Alt + Enter</kbd></td><td>Generate bill & checkout</td></tr>
            <tr><td><kbd style="background:var(--border); padding:2px 6px; border-radius:4px; font-weight:700;">Alt + K</kbd></td><td>Open this shortcuts handbook</td></tr>
          </tbody>
        </table>
      </div>
    `;
    modal('⌨️ Keyboard Shortcuts Handbook', modalHtml, `
      <button class="btn btn-primary" style="flex:1" onclick="closeModal()">Got it</button>
    `);
  };

  c._lb_cleanup = () => {
    window.removeEventListener('keydown', handleBarcode);
    window.removeEventListener('keydown', handleBillingShortcuts);
  };

  window.addEventListener('keydown', handleBarcode);
  window.addEventListener('keydown', handleBillingShortcuts);
}

window.printBill = (data) => {
    const { res, items, cust, disc, pay } = data;
    const config = window.APP?.config || {};
    const shopName = config.name || "PharmaPro Retail";
    const shopAddress = config.address || "123 Main Street, Bangalore";
    const shopPhone = config.phone || "+91 98765 43210";
    const shopEmail = config.email || "contact@pharmapro.com";
    const shopGSTIN = config.gstin || "29AAAAA0000A1Z5";
    const shopLicence = config.licence || "DL-12345/2026";
    const shopState = config.state || "KA";
    const gstPct = parseFloat(config.gst_slab || 12);

    let formattedDate = "";
    try {
      if (res.created_at) {
        const dateStr = res.created_at.replace(' ', 'T') + (res.created_at.indexOf('Z') === -1 ? 'Z' : '');
        formattedDate = new Date(dateStr).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      } else {
        formattedDate = new Date().toLocaleString('en-IN');
      }
    } catch (e) {
      formattedDate = res.created_at || new Date().toLocaleString('en-IN');
    }

    const fmtVal = n => '₹' + Number(n).toFixed(2);
    
    // Financial calculations
    const subtotal = res.subtotal || items.reduce((s, i) => s + (i.tablets_qty || i.qty || 0) * (i.mrp_per_tab || i.mrp_per_tablet || 0), 0);
    const discAmt = res.discount_amt || (subtotal * disc / 100);
    const taxableVal = subtotal - discAmt;
    const gstAmt = res.gst_amt || (taxableVal * (gstPct / 100));
    const totalVal = res.total || (taxableVal + gstAmt);
    const cgstAmt = gstAmt / 2;
    const sgstAmt = gstAmt / 2;
    const isInclusive = Math.abs(totalVal - (subtotal - discAmt)) < 0.1;

    const w = window.open('', '_blank', 'width=800,height=800');
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Tax Invoice - ${res.bill_no}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px; color: #1e293b; background: #fff; font-size: 12px; line-height: 1.4; }
    .invoice-card { max-width: 650px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .header { text-align: center; margin-bottom: 15px; }
    .shop-name { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .shop-details { color: #64748b; font-size: 11px; margin-bottom: 2px; }
    .invoice-title { font-size: 14px; font-weight: 700; color: #0f172a; margin: 10px 0; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 4px 0; text-transform: uppercase; letter-spacing: 1px; text-align: center; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px; }
    .info-block { border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 6px; background-color: #f8fafc; }
    .info-title { font-weight: 700; color: #475569; margin-bottom: 4px; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .info-label { color: #64748b; }
    .info-value { font-weight: 600; color: #0f172a; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    .items-table th { background-color: #f1f5f9; color: #475569; font-weight: 700; font-size: 10px; text-transform: uppercase; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; text-align: left; }
    .items-table td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; vertical-align: top; }
    .item-name { font-weight: 700; color: #0f172a; }
    .item-sub { font-size: 9px; color: #64748b; margin-top: 2px; }
    .summary-container { display: flex; justify-content: flex-end; margin-bottom: 15px; }
    .summary-table { width: 280px; border-collapse: collapse; }
    .summary-table td { padding: 4px 6px; font-size: 11px; }
    .summary-table tr.total-row { font-size: 14px; font-weight: 800; background-color: #f8fafc; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; }
    .summary-table tr.total-row td { padding: 8px 6px; color: #0f172a; }
    .footer { text-align: center; margin-top: 20px; padding-top: 12px; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 10px; line-height: 1.5; }
    .warning-box { margin-top: 10px; padding: 6px 8px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; color: #b45309; font-size: 9px; text-align: left; line-height: 1.3; }
    .no-print { display: block; }
    @media print {
      body { padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .warning-box { background-color: #fff; border-color: #ccc; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width:650px;margin: 0 auto 20px auto;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;font-family:'Segoe UI',system-ui,sans-serif;">
    <button onclick="window.history.back() || (window.location.href='/')" style="padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">← Back to App</button>
    <button onclick="shareInvoiceFromPrint()" style="padding:8px 16px;background:#25d366;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">💬 WhatsApp</button>
    <span style="font-size:12px;color:#475569;font-weight:600">Print page loaded.</span>
    <button onclick="window.close()" style="padding:8px 16px;background:#ef4444;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">Close Tab ✕</button>
  </div>
  <div class="invoice-card">
    <div class="header">
      <div class="shop-name">${shopName}</div>
      <div class="shop-details">${shopAddress}</div>
      <div class="shop-details">Phone: ${shopPhone} | Email: ${shopEmail}</div>
      <div class="shop-details"><b>GSTIN:</b> ${shopGSTIN} | <b>D.L. No.:</b> ${shopLicence}</div>
    </div>
    
    <div class="invoice-title">Tax Invoice</div>
    
    <div class="info-grid">
      <div class="info-block">
        <div class="info-title">Invoice Details</div>
        <div class="info-row"><span class="info-label">Invoice No:</span><span class="info-value">${res.bill_no}</span></div>
        <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${formattedDate}</span></div>
        <div class="info-row"><span class="info-label">Payment Mode:</span><span class="info-value">${pay}</span></div>
        <div class="info-row"><span class="info-label">State Code:</span><span class="info-value">${shopState}</span></div>
      </div>
      <div class="info-block">
        <div class="info-title">Customer / Patient</div>
        <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${cust ? cust.name : (res.patient_name || 'Walk-in Customer')}</span></div>
        <div class="info-row"><span class="info-label">Contact:</span><span class="info-value">${cust?.phone || 'N/A'}</span></div>
        <div class="info-row"><span class="info-label">Doctor:</span><span class="info-value">${res.doctor || 'Self / General'}</span></div>
        ${res.rx_no ? `<div class="info-row"><span class="info-label">Rx No:</span><span class="info-value">${res.rx_no}</span></div>` : ''}
      </div>
    </div>
    
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 5%">#</th>
          <th style="width: 40%">Medicine / Description</th>
          <th style="width: 12%">HSN</th>
          <th style="width: 12%">Batch</th>
          <th style="width: 10%">Expiry</th>
          <th style="text-align: right; width: 8%">Qty</th>
          <th style="text-align: right; width: 10%">Rate</th>
          <th style="text-align: right; width: 13%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((i, idx) => {
          const qty = i.tablets_qty || i.qty || 0;
          const rate = i.mrp_per_tab || i.mrp_per_tablet || 0;
          const hsn = i.hsn || '30049099';
          const batch = i.batch_no || 'N/A';
          const expiry = i.expiry ? i.expiry.slice(0, 7) : 'N/A';
          const amt = i.amount || (qty * rate);
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>
                <div class="item-name">${i.name}</div>
                <div class="item-sub">${i.brand || ''}</div>
              </td>
              <td>${hsn}</td>
              <td>${batch}</td>
              <td>${expiry}</td>
              <td style="text-align: right">${qty}</td>
              <td style="text-align: right">${rate.toFixed(2)}</td>
              <td style="text-align: right">${amt.toFixed(2)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    
    <div class="summary-container">
      <table class="summary-table">
        <tr>
          <td class="info-label">Subtotal:</td>
          <td style="text-align: right; font-weight: 600;">${fmtVal(subtotal)}</td>
        </tr>
        ${disc > 0 ? `
        <tr>
          <td class="info-label">Discount (${disc}%):</td>
          <td style="text-align: right; font-weight: 600; color: #dc2626;">-${fmtVal(discAmt)}</td>
        </tr>
        ` : ''}
        ${isInclusive ? '' : `
        <tr>
          <td class="info-label">Taxable Value:</td>
          <td style="text-align: right; font-weight: 600;">${fmtVal(taxableVal)}</td>
        </tr>
        <tr>
          <td class="info-label">CGST (${(gstPct/2)}%):</td>
          <td style="text-align: right; font-weight: 600;">${fmtVal(cgstAmt)}</td>
        </tr>
        <tr>
          <td class="info-label">SGST (${(gstPct/2)}%):</td>
          <td style="text-align: right; font-weight: 600;">${fmtVal(sgstAmt)}</td>
        </tr>
        `}
        <tr class="total-row">
          <td>Total Net Payable:</td>
          <td style="text-align: right;">${fmtVal(totalVal)}</td>
        </tr>
      </table>
    </div>

    ${cust && cust.loyalty_points > 0 ? `
      <div style="font-size: 10px; color: #475569; background: #f1f5f9; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px;">
        <b>Loyalty Points Summary:</b> Current Balance: <b>${cust.loyalty_points}</b> points. 
        ${res.points_redeemed ? `Points redeemed in this transaction: <b>${res.points_redeemed}</b>.` : ''}
      </div>
    ` : ''}
    
    <div class="warning-box">
      <b>Warning:</b> Consult your doctor/pharmacist before taking any medicine. Take prescription drugs only under supervision. Keep all medicines out of reach of children.
    </div>
    
    <div class="footer">
      <div>Thank you for choosing ${shopName}!</div>
      <div style="font-weight: 600; margin-top: 4px;">Get Well Soon! 💊</div>
    </div>
  </div>
  <script>
    window.onload = function() { window.print(); };
    function shareInvoiceFromPrint() {
      const billId = ${res.id};
      const patientName = '${(res.patient_name || '').replace(/'/g, "\\'")}';
      const billNo = '${res.bill_no}';
      const total = ${totalVal};
      let phone = '${cust?.phone || res.customer_phone || ''}';
      
      if (window.opener && window.opener.shareBillOnWhatsapp) {
        window.opener.shareBillOnWhatsapp(billId, patientName, billNo, total, phone);
      } else {
        phone = phone.replace(/[^0-9]/g, '');
        if (!phone) {
          phone = prompt("Enter a 10-digit phone number to send via WhatsApp:");
          if (!phone) return;
          phone = phone.replace(/[^0-9]/g, '');
        }
        if (phone.length < 10) {
          alert("Please enter a valid 10-digit mobile number.");
          return;
        }
        const waPhone = phone.length === 10 ? '91' + phone : phone;
        const msg = "Thank you for your purchase in Shrivari Medicals! Here is your invoice no " + billNo + " amounting to Rs. " + total.toFixed(2) + ".";
        const pdfUrl = window.location.origin + "/api/bills/" + billId + "/pdf";
        
        if (window.AndroidBridge && window.AndroidBridge.shareBillPdf) {
          window.AndroidBridge.shareBillPdf(pdfUrl, waPhone, msg);
        } else {
          const waUrl = "https://api.whatsapp.com/send?phone=" + waPhone + "&text=" + encodeURIComponent(msg);
          if (window.AndroidBridge && window.AndroidBridge.openExternalUrl) {
            window.AndroidBridge.openExternalUrl(waUrl);
          } else {
            window.open(waUrl, "_blank");
          }
        }
      }
    }
  </script>
</body>
</html>
    `);
  };

  window.printChallan = (data) => {
    const { res, items, cust } = data;
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<html><head><title>DELIVERY CHALLAN ${res.bill_no}</title>
    <style>
      body{font-family:sans-serif;padding:24px;color:#111;font-size:13px}
      .row{display:flex;justify-content:space-between}hr{border-top:1px solid #111;margin:16px 0}
      .big{font-size:24px;font-weight:900}table{width:100%;border-collapse:collapse;margin-top:20px}
      td,th{padding:8px;border:1px solid #666;text-align:left}th{background:#eee}
      .no-print { display: block; }
      @media print {
        .no-print { display: none !important; }
      }
    </style>
    </head><body>
    <div class="no-print" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;font-family:sans-serif;margin-bottom:20px;">
      <button onclick="window.history.back() || (window.location.href='/')" style="padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">← Back to App</button>
      <span style="font-size:12px;color:#475569;font-weight:600">Print page loaded.</span>
      <button onclick="window.close()" style="padding:8px 16px;background:#ef4444;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">Close Tab ✕</button>
    </div>
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
