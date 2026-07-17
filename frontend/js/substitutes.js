// substitutes.js — Medicine Substitution Panel
// Shows in-stock alternatives and orderable alternatives for any drug
import { GET } from './api.js';
import { toast } from './utils.js';

/**
 * Render a substitution panel for a given drug.
 * @param {string} containerId  - ID of element to render into
 * @param {object} opts         - { drug_id, name, composition }
 * @param {function} onSelect   - called with a shop drug object when user picks one (optional)
 */
export async function renderSubstitutes(containerId, opts = {}, onSelect = null, genericOnly = false) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `<div style="padding:12px;text-align:center;color:var(--muted)">
    <div class="spinner" style="margin:0 auto 8px"></div>
    <div style="font-size:12px">Finding alternatives…</div>
  </div>`;

  try {
    const params = new URLSearchParams();
    if (opts.drug_id)     params.set('drug_id', opts.drug_id);
    if (opts.name)        params.set('name', opts.name);
    if (opts.composition) params.set('composition', opts.composition);

    const data = await GET('/drugs/substitutes?' + params.toString());

    if (!data.composition) {
      el.innerHTML = `<div class="alert-strip warn" style="font-size:12px">
        ⚠️ No composition data found for <b>${opts.name || 'this medicine'}</b>.
        Cannot suggest alternatives.
      </div>`;
      return;
    }

    let exactInStock  = data.exact_in_stock  || [];
    let exactOrderable = data.exact_orderable || [];
    let combInStock  = data.comb_in_stock  || [];
    let combOrderable = data.comb_orderable || [];

    if (genericOnly) {
      exactInStock = exactInStock.filter(d => (d.category || '').toLowerCase() === 'generic');
      combInStock = combInStock.filter(d => (d.category || '').toLowerCase() === 'generic');
    }

    const exactAvailable = exactInStock.filter(d => d.available);
    const exactOutOfStock = exactInStock.filter(d => !d.available);
    const combAvailable = combInStock.filter(d => d.available);
    const combOutOfStock = combInStock.filter(d => !d.available);

    let html = `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div style="padding:12px 16px;background:var(--faint);border-bottom:1px solid var(--border)">
          <div style="font-weight:800;font-size:13px;color:var(--text)">
            🔄 Alternatives for <span style="color:var(--accent)">${data.drug_name || opts.name}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">
            Active ingredient: <b style="color:var(--text)">${data.key_ingredients?.join(' + ') || data.composition}</b>
          </div>
        </div>`;

    // ── SECTION 1: Exact Same Composition ──────────────────────
    html += `<div style="padding:10px 14px;background:var(--accent-dim);border-bottom:1px solid var(--border);font-weight:800;font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px">
      🎯 Exact Same Composition Alternatives
    </div>`;

    let exactCount = 0;

    if (exactAvailable.length > 0) {
      html += `<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--green);background:var(--green-dim)">
        ✅ IN YOUR SHOP — Ready to dispense
      </div>`;
      exactAvailable.forEach(d => {
        exactCount++;
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.brand || ''} · ${d.composition || ''} · <span class="tag tag-blue" style="font-size:10px;padding:2px 6px">${d.category || 'Ethical'}</span></div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;color:var(--text)">₹${d.mrp_per_strip || 0}</div>
            <div style="font-size:10px;color:var(--green);font-weight:700">${d.stock_tablets} tabs</div>
          </div>
          ${onSelect ? `<button class="btn btn-primary btn-sm" onclick="__subSelect(${d.id})">Bill This</button>` : ''}
        </div>`;
      });
    }

    if (exactOutOfStock.length > 0) {
      html += `<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--warn);background:var(--warn-dim)">
        ⚠️ ALSO IN SHOP — Currently out of stock
      </div>`;
      exactOutOfStock.forEach(d => {
        exactCount++;
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px;opacity:0.7">
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.brand || ''}</div>
          </div>
          <div style="font-size:10px;color:var(--danger);font-weight:700">Out of stock</div>
        </div>`;
      });
    }

    if (exactOrderable.length > 0) {
      html += `<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--info);background:var(--info-dim)">
        📋 CAN BE ORDERED — Not in shop stock
      </div>`;
      exactOrderable.slice(0, 10).forEach(o => {
        exactCount++;
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">${o.name}</div>
            <div style="font-size:11px;color:var(--muted)">${o.manufacturer || ''}</div>
          </div>
          <div style="font-weight:700;color:var(--muted);font-size:12px">MRP ₹${o.mrp || '—'}</div>
        </div>`;
      });
    }

    if (exactCount === 0) {
      html += `<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">
        No exact composition matches found.
      </div>`;
    }

    // ── SECTION 2: Combinations / Broader Formulations ────────
    html += `<div style="padding:10px 14px;background:var(--faint);border-top:1px solid var(--border);border-bottom:1px solid var(--border);font-weight:800;font-size:11px;color:var(--text);text-transform:uppercase;letter-spacing:0.5px">
      🧪 Combinations containing ${data.key_ingredients?.join(' or ') || 'it'}
    </div>`;

    let combCount = 0;

    if (combAvailable.length > 0) {
      html += `<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--green);background:var(--green-dim)">
        ✅ IN YOUR SHOP — Ready to dispense
      </div>`;
      combAvailable.forEach(d => {
        combCount++;
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.brand || ''} · ${d.composition || ''} · <span class="tag tag-blue" style="font-size:10px;padding:2px 6px">${d.category || 'Ethical'}</span></div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;color:var(--text)">₹${d.mrp_per_strip || 0}</div>
            <div style="font-size:10px;color:var(--green);font-weight:700">${d.stock_tablets} tabs</div>
          </div>
          ${onSelect ? `<button class="btn btn-primary btn-sm" onclick="__subSelect(${d.id})">Bill This</button>` : ''}
        </div>`;
      });
    }

    if (combOutOfStock.length > 0) {
      html += `<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--warn);background:var(--warn-dim)">
        ⚠️ ALSO IN SHOP — Currently out of stock
      </div>`;
      combOutOfStock.forEach(d => {
        combCount++;
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px;opacity:0.7">
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.brand || ''} · ${d.composition || ''}</div>
          </div>
          <div style="font-size:10px;color:var(--danger);font-weight:700">Out of stock</div>
        </div>`;
      });
    }

    if (combOrderable.length > 0) {
      html += `<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--info);background:var(--info-dim)">
        📋 CAN BE ORDERED — Not in shop stock
      </div>`;
      combOrderable.slice(0, 10).forEach(o => {
        combCount++;
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">${o.name}</div>
            <div style="font-size:11px;color:var(--muted)">${o.composition || ''} · ${o.manufacturer || ''}</div>
          </div>
          <div style="font-weight:700;color:var(--muted);font-size:12px">MRP ₹${o.mrp || '—'}</div>
        </div>`;
      });
    }

    if (combCount === 0) {
      html += `<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">
        No combination matches found.
      </div>`;
    }

    html += `</div>`;
    el.innerHTML = html;

    // Wire up select handler
    if (onSelect) {
      window.__subSelect = (id) => {
        const drug = [...exactInStock, ...combInStock].find(d => d.id === id);
        if (drug) onSelect(drug);
      };
    }

  } catch (e) {
    el.innerHTML = `<div class="alert-strip danger">❌ Could not load alternatives: ${e.message}</div>`;
  }
}

/**
 * Quick inline substitutes lookup — creates a modal with alternatives.
 * Call this from anywhere: showSubstitutesModal({ name, composition })
 */
export function showSubstitutesModal(opts = {}, onSelect = null, genericOnly = false) {
  // Create modal container
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'sub-modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="modal-title" style="margin-bottom:0">💊 Find Alternative Medicines</div>
        <button onclick="document.getElementById('sub-modal-overlay').remove()"
          style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer">×</button>
      </div>
      <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="sub-generic-toggle" ${genericOnly ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)" onchange="window.toggleSubGeneric()">
        <label for="sub-generic-toggle" style="font-weight:700;font-size:13px;cursor:pointer;color:var(--text)">Show Generic Alternates Only</label>
      </div>
      <div id="sub-modal-body"></div>
    </div>`;
  document.body.appendChild(overlay);

  window.toggleSubGeneric = () => {
    const isChecked = document.getElementById('sub-generic-toggle').checked;
    renderSubstitutes('sub-modal-body', opts, (drug) => {
      overlay.remove();
      if (onSelect) onSelect(drug);
    }, isChecked);
  };

  renderSubstitutes('sub-modal-body', opts, (drug) => {
    overlay.remove();
    if (onSelect) onSelect(drug);
  }, genericOnly);
}
