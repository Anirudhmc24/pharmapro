// dashboard.js — Dashboard page
import { GET } from './api.js';
import { fmt, fmtI, today, expiryColor, fmtExp, monthsLeft, tag } from './utils.js';

function statCard(icon, lbl, val, color, sub, trend) {
  let trendHtml = '';
  if (trend !== undefined && trend !== null) {
    const up   = trend >= 0;
    const pct  = trend === Infinity ? '—' : Math.abs(trend).toFixed(1) + '%';
    const col  = up ? 'var(--green)' : 'var(--danger)';
    const arr  = up ? '▲' : '▼';
    trendHtml  = `<div style="font-size:11px;color:${col};margin-top:4px;font-weight:700">${arr} ${pct} vs prev</div>`;
  }
  return `<div class="stat-card">
    <div class="stat-glow" style="background:radial-gradient(circle at 80% 20%,${color}18,transparent 60%)"></div>
    <div style="font-size:22px;margin-bottom:6px">${icon}</div>
    <div class="stat-val" style="color:${color}">${val}</div>
    <div class="stat-lbl">${lbl}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    ${trendHtml}
  </div>`;
}

export async function renderDashboard(c, APP) {
  const d = await GET('/dashboard');
  const maxRev = Math.max(...(d.week_revenue || [{ revenue: 1 }]).map(r => r.revenue || 1), 1);

  c.innerHTML = `
  <div class="gap-16 fade-in">
    <div>
      <div style="font-size:20px;font-weight:800;color:var(--text)">Good day 👋</div>
      <div style="color:var(--muted);font-size:13px;margin-top:3px">${today()} · ${APP.config.name || 'PharmaPro'}</div>
    </div>

    ${(d.expired > 0 || d.expiring > 0 || d.low_stock > 0 || d.critical_trays > 0) ? `
    <div class="alert-strip warn">
      ${d.expired > 0 ? `<span>⛔ ${d.expired} expired batch${d.expired > 1 ? 'es' : ''}</span>` : ''}
      ${d.expiring > 0 ? `<span>⚠️ ${d.expiring} expiring soon</span>` : ''}
      ${d.low_stock > 0 ? `<span>📦 ${d.low_stock} low stock</span>` : ''}
      ${d.critical_trays > 0 ? `<span>✂️ ${d.critical_trays} critical tray${d.critical_trays > 1 ? 's' : ''}</span>` : ''}
    </div>` : ''}

    <div class="grid-4" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      ${statCard('💰', 'Today Revenue', fmtI(d.today_revenue), 'var(--accent)', d.today_bills + ' bills',
        d.yesterday_revenue > 0 ? ((d.today_revenue - d.yesterday_revenue) / d.yesterday_revenue * 100) : null)}
      ${statCard('🧾', 'Bills Today', d.today_bills, 'var(--info)', d.today_bills > 0 ? 'Avg ' + fmtI(d.today_revenue / (d.today_bills || 1)) : '')}
      ${statCard('📦', 'Total Drugs', d.total_drugs, 'var(--purple)', d.low_stock + ' low stock')}
      ${statCard('📋', 'Open POs', d.open_pos || 0, 'var(--warn)', 'pending delivery')}
    </div>

    <div class="grid-4" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${statCard('📅', 'This Week (7d)', fmtI(d.week_total || 0), 'var(--info)', (d.week_bills || 0) + ' bills',
        d.last_week_total > 0 ? ((d.week_total - d.last_week_total) / d.last_week_total * 100) : null)}
      ${statCard('📆', 'This Month', fmtI(d.month_total || 0), 'var(--purple)', (d.month_bills || 0) + ' bills',
        d.last_month_total > 0 ? ((d.month_total - d.last_month_total) / d.last_month_total * 100) : null)}
      ${statCard('📊', 'Avg Daily (month)', fmtI(Math.round((d.month_total || 0) / (new Date().getDate()))), 'var(--green)',
        'per day so far')}
      ${statCard('🎯', 'Monthly Avg Bill', fmtI(d.month_bills > 0 ? Math.round(d.month_total / d.month_bills) : 0),
        'var(--accent)', d.month_bills + ' bills this month')}
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="section-title">This Week</div>
        <div class="bar-chart">
          ${(d.week_revenue || []).map(r => `
          <div class="bar-col">
            <div class="bar" style="height:${Math.round((r.revenue / maxRev) * 90)}px" title="${fmtI(r.revenue)}"></div>
            <div class="bar-lbl">${r.day?.slice(5) || ''}</div>
          </div>`).join('') || '<div style="color:var(--muted);font-size:12px">No sales yet</div>'}
        </div>
      </div>
      <div class="card gap-12">
        <div class="section-title">Quick Actions</div>
        <button class="btn btn-primary" style="width:100%" onclick="APP.navigate('billing')">🧾 New Bill</button>
        <button class="btn btn-outline" style="width:100%" onclick="APP.navigate('stock_entry')">📥 Add Stock</button>
        <button class="btn btn-outline" style="width:100%" onclick="APP.navigate('purchase_orders')">📋 Purchase Orders</button>
        <button class="btn btn-outline" style="width:100%" onclick="APP.navigate('reports')">📊 Reports</button>
      </div>
    </div>

    ${d.near_expiry_alerts?.length ? `
    <div class="card">
      <div class="flex-between" style="margin-bottom:14px">
        <div>
          <div class="section-title" style="color:var(--danger)">⚠️ Near Expiry & Expired Medicines</div>
          <div style="color:var(--muted);font-size:12px">${d.near_expiry_alerts.length} batch${d.near_expiry_alerts.length > 1 ? 'es' : ''} expiring/expired soon — consider initiating expiry returns</div>
        </div>
      </div>
      <div style="overflow:auto">
        <table class="tbl">
          <thead><tr><th>Drug</th><th>Batch</th><th>Expiry Date</th><th>Strips Left</th><th>Status</th><th>Location</th></tr></thead>
          <tbody>
          ${d.near_expiry_alerts.map((r) => {
            const ml = monthsLeft(r.expiry);
            let statusText = '';
            let statusColor = '';
            if (ml <= 0) {
              statusText = 'Expired';
              statusColor = 'var(--danger)';
            } else if (ml <= 1) {
              statusText = 'Expires in ' + ml + 'm';
              statusColor = 'var(--danger)';
            } else {
              statusText = 'Expires in ' + ml + 'm';
              statusColor = 'var(--warn)';
            }
            return `<tr>
              <td><div style="font-weight:700">${r.name}</div><div style="font-size:11px;color:var(--muted)">${r.brand || ''}</div></td>
              <td><code>${r.batch_no}</code></td>
              <td><span style="font-weight:800;color:${expiryColor(r.expiry)}">${fmtExp(r.expiry)}</span></td>
              <td><span style="font-weight:800">${r.full_strips}</span> strips</td>
              <td><span class="tag" style="background:${statusColor}18;color:${statusColor};font-weight:700">${statusText}</span></td>
              <td><button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:10px" onclick="locateDrug(${r.drug_id})">📍 Locate</button></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${d.reorder_alerts?.length ? `
    <div class="card">
      <div class="flex-between" style="margin-bottom:14px">
        <div>
          <div class="section-title">🤖 AI Reorder Suggestions</div>
          <div style="color:var(--muted);font-size:12px">${d.reorder_alerts.length} drug${d.reorder_alerts.length > 1 ? 's' : ''} need restocking — select and create PO instantly</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="reorderSelectAll()">Select All</button>
          <button class="btn btn-primary btn-sm" onclick="createPOFromReorder()">📋 Create PO from selection →</button>
        </div>
      </div>
      <div style="overflow:auto">
        <table class="tbl">
          <thead><tr><th style="width:36px"><input type="checkbox" id="reorder-chk-all" onchange="reorderToggleAll(this)" style="accent-color:var(--accent)"></th><th>Drug</th><th>Stock Left</th><th>Sold (30d)</th><th>Days Left</th><th>Suggest Order</th><th>Location</th></tr></thead>
          <tbody>
          ${d.reorder_alerts.map((r, i) => {
            const stockTabs = r.stock_tablets || 0;
            const sold30    = r.sold_30d || 0;
            const daysLeft  = sold30 > 0 ? Math.round(stockTabs / (sold30 / 30)) : 999;
            const tps       = r.tablets_per_strip || 10;
            const suggestStrips = Math.max(1, Math.ceil((sold30 / 30 * 30 - stockTabs) / tps));
            return `<tr>
              <td><input type="checkbox" class="reorder-chk" value="${r.id}" data-name="${r.name}" data-rate="${r.mrp_per_strip || 0}" data-strips="${suggestStrips}" checked style="accent-color:var(--accent)"></td>
              <td><div style="font-weight:700">${r.name}</div><div style="font-size:11px;color:var(--muted)">${r.brand || ''}</div></td>
              <td><span style="font-weight:800;color:${stockTabs < 10 ? 'var(--danger)' : 'var(--warn)'}">${stockTabs}</span> tabs</td>
              <td>${sold30} tabs</td>
              <td>${daysLeft < 999 ? `<span style="color:${daysLeft <= 3 ? 'var(--danger)' : 'var(--warn)'}; font-weight:700">${daysLeft}d</span>` : '—'}</td>
              <td><span style="color:var(--accent);font-weight:700">${suggestStrips} strips</span></td>
              <td><button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:10px" onclick="locateDrug(${r.id})">📍 Locate</button></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${d.daily_reorder_alerts?.length ? `
    <div class="card">
      <div class="flex-between" style="margin-bottom:14px">
        <div>
          <div class="section-title">📦 Daily Reorder Suggestions (Sold Today)</div>
          <div style="color:var(--muted);font-size:12px">${d.daily_reorder_alerts.length} drug${d.daily_reorder_alerts.length > 1 ? 's' : ''} sold today — select and restock instantly</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="dailyReorderSelectAll()">Select All</button>
          <button class="btn btn-primary btn-sm" onclick="createPOFromDailyReorder()">📋 Create PO from selection →</button>
        </div>
      </div>
      <div style="overflow:auto">
        <table class="tbl">
          <thead><tr><th style="width:36px"><input type="checkbox" id="daily-reorder-chk-all" onchange="dailyReorderToggleAll(this)" style="accent-color:var(--accent)"></th><th>Drug</th><th>Stock Left</th><th>Sold Today</th><th>Suggest Order</th><th>Location</th></tr></thead>
          <tbody>
          ${d.daily_reorder_alerts.map((r, i) => {
            const stockTabs = r.stock_tablets || 0;
            const soldToday = r.sold_today || 0;
            const tps       = r.tablets_per_strip || 10;
            const suggestStrips = Math.max(1, Math.ceil(soldToday / tps));
            return `<tr>
              <td><input type="checkbox" class="daily-reorder-chk" value="${r.id}" data-name="${r.name}" data-rate="${r.mrp_per_strip || 0}" data-strips="${suggestStrips}" checked style="accent-color:var(--accent)"></td>
              <td><div style="font-weight:700">${r.name}</div><div style="font-size:11px;color:var(--muted)">${r.brand || ''}</div></td>
              <td><span style="font-weight:800;color:${stockTabs < 10 ? 'var(--danger)' : 'var(--warn)'}">${stockTabs}</span> tabs</td>
              <td>${soldToday} tabs</td>
              <td><span style="color:var(--accent);font-weight:700">${suggestStrips} strips</span></td>
              <td><button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:10px" onclick="locateDrug(${r.id})">📍 Locate</button></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  </div>`;

  // Reorder → PO helpers exposed globally
  window.reorderToggleAll = (chk) => {
    document.querySelectorAll('.reorder-chk').forEach(c => c.checked = chk.checked);
  };
  window.reorderSelectAll = () => {
    document.querySelectorAll('.reorder-chk').forEach(c => c.checked = true);
    const allChk = document.getElementById('reorder-chk-all');
    if (allChk) allChk.checked = true;
  };
  window.createPOFromReorder = () => {
    const selected = [...document.querySelectorAll('.reorder-chk:checked')].map(c => ({
      drug_id: parseInt(c.value),
      name:    c.dataset.name,
      rate:    parseFloat(c.dataset.rate || 0),
      strips:  parseInt(c.dataset.strips || 1),
    }));
    if (!selected.length) { alert('Select at least one drug'); return; }
    // Pass reorder drugs to PO creation via sessionStorage
    sessionStorage.setItem('po_preload', JSON.stringify(selected));
    APP.navigate('purchase_orders');
  };

  window.dailyReorderToggleAll = (chk) => {
    document.querySelectorAll('.daily-reorder-chk').forEach(c => c.checked = chk.checked);
  };
  window.dailyReorderSelectAll = () => {
    document.querySelectorAll('.daily-reorder-chk').forEach(c => c.checked = true);
    const allChk = document.getElementById('daily-reorder-chk-all');
    if (allChk) allChk.checked = true;
  };
  window.createPOFromDailyReorder = () => {
    const selected = [...document.querySelectorAll('.daily-reorder-chk:checked')].map(c => ({
      drug_id: parseInt(c.value),
      name:    c.dataset.name,
      rate:    parseFloat(c.dataset.rate || 0),
      strips:  parseInt(c.dataset.strips || 1),
    }));
    if (!selected.length) { alert('Select at least one drug'); return; }
    // Pass reorder drugs to PO creation via sessionStorage
    sessionStorage.setItem('po_preload', JSON.stringify(selected));
    APP.navigate('purchase_orders');
  };

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
}
