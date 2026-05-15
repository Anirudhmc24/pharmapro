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
export async function renderSubstitutes(containerId, opts = {}, onSelect = null) {
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

    const inStock  = data.in_stock  || [];
    const orderable = data.orderable || [];
    const available = inStock.filter(d => d.available);
    const outOfStock = inStock.filter(d => !d.available);

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

    // ── IN STOCK alternatives ─────────────────────────────────
    if (available.length > 0) {
      html += `<div style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--green);background:var(--green-dim)">
        ✅ IN YOUR SHOP — Ready to dispense
      </div>`;
      available.forEach(d => {
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.brand || ''} · ${d.composition || ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;color:var(--text)">₹${d.mrp_per_strip || 0}</div>
            <div style="font-size:10px;color:var(--green);font-weight:700">${d.stock_tablets} tabs</div>
          </div>
          ${onSelect ? `<button class="btn btn-primary btn-sm" onclick="__subSelect(${d.id})">Bill This</button>` : ''}
        </div>`;
      });
    }

    // ── OUT OF STOCK shop alternatives ───────────────────────
    if (outOfStock.length > 0) {
      html += `<div style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--warn);background:var(--warn-dim)">
        ⚠️ ALSO IN SHOP — Currently out of stock
      </div>`;
      outOfStock.forEach(d => {
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px;opacity:0.7">
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.brand || ''}</div>
          </div>
          <div style="font-size:10px;color:var(--danger);font-weight:700">Out of stock</div>
        </div>`;
      });
    }

    // ── ORDERABLE from master DB ──────────────────────────────
    if (orderable.length > 0) {
      html += `<div style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--info);background:var(--info-dim)">
        📋 CAN BE ORDERED — Same composition, not in your shop yet
      </div>`;
      orderable.slice(0, 8).forEach(d => {
        html += `<div style="padding:10px 16px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">${d.name}</div>
            <div style="font-size:11px;color:var(--muted)">${d.manufacturer || ''}</div>
          </div>
          <div style="font-weight:700;color:var(--muted);font-size:12px">MRP ₹${d.mrp || '—'}</div>
        </div>`;
      });
    }

    if (!available.length && !outOfStock.length && !orderable.length) {
      html += `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">
        No alternatives found with the same active ingredient.
      </div>`;
    }

    html += `</div>`;
    el.innerHTML = html;

    // Wire up select handler
    if (onSelect) {
      window.__subSelect = (id) => {
        const drug = (data.in_stock || []).find(d => d.id === id);
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
export function showSubstitutesModal(opts = {}, onSelect = null) {
  // Create modal container
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'sub-modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="modal-title" style="margin-bottom:0">💊 Find Alternative Medicines</div>
        <button onclick="document.getElementById('sub-modal-overlay').remove()"
          style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer">×</button>
      </div>
      <div id="sub-modal-body"></div>
    </div>`;
  document.body.appendChild(overlay);

  renderSubstitutes('sub-modal-body', opts, (drug) => {
    overlay.remove();
    if (onSelect) onSelect(drug);
  });
}
