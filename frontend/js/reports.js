// reports.js — All reports with CSV download
import { GET } from './api.js';
import { fmt, fmtI, fmtExp, expiryTag, expiryColor, formatDate, csvDownload } from './utils.js';

export async function renderReports(c, APP) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const today     = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  c.innerHTML = `<div class="gap-16 fade-in">
    <h2 style="font-size:18px;font-weight:800">Reports & Analytics</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
      ${[
        { icon: '📊', name: 'Sales Summary', desc: 'Daily sales, payment breakdown', color: 'var(--accent)', id: 'sales' },
        { icon: '👥', name: 'Staff Performance', desc: 'Bills & revenue per employee', color: 'var(--green)', id: 'staff_perf' },
        { icon: '💊', name: 'Drug-wise Sales', desc: 'Revenue by drug + units sold', color: 'var(--purple)', id: 'drugwise' },
        { icon: '📦', name: 'Stock Value', desc: 'MRP & cost value of current stock', color: 'var(--info)', id: 'stock_value' },
        { icon: '💹', name: 'Profit & Loss', desc: 'Revenue minus cost of goods', color: 'var(--green)', id: 'pl' },
        { icon: '🧾', name: 'GSTR-1', desc: 'GST return — all taxable bills', color: 'var(--warn)', id: 'gstr1' },
        { icon: '⏰', name: 'Expiry Report', desc: 'Expired & near-expiry batches', color: 'var(--danger)', id: 'expiry' },
        { icon: '🔐', name: 'Schedule H/X Log', desc: 'Controlled substances register', color: 'var(--purple)', id: 'schedule_log' },
        { icon: '🔒', name: 'Day Close', desc: 'Z-report · Cash reconciliation', color: 'var(--accent)', id: 'dayclose' },
      ].map(r => `<div class="card" style="cursor:pointer;transition:all .2s;border-color:transparent"
        onmouseenter="this.style.borderColor='${r.color}55';this.style.transform='translateY(-2px)'"
        onmouseleave="this.style.borderColor='var(--border)';this.style.transform='none'"
        onclick="runReport('${r.id}')">
        <div style="font-size:28px;margin-bottom:10px">${r.icon}</div>
        <div style="font-weight:800;color:var(--text);font-size:14px;margin-bottom:4px">${r.name}</div>
        <div style="color:var(--muted);font-size:12px">${r.desc}</div>
      </div>`).join('')}
    </div>
    <div id="report-output"></div>
  </div>`;

  window.runReport = async (id) => {
    const out = document.getElementById('report-output');
    out.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:20px;color:var(--muted)"><div class="spinner"></div> Generating…</div>';

    if (id === 'sales') {
      const data = await GET(`/reports/sales?from_date=${monthStart}&to_date=${today}`);
      const s    = data.summary;
      out.innerHTML = `<div class="card gap-16">
        <div class="flex-between">
          <div class="section-title">Sales Summary — This Month</div>
          <button class="btn btn-outline btn-sm" onclick="csvDl('sales')">⬇ CSV</button>
        </div>
        <div class="grid-4" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
          ${[['Bills', s.total_bills, 'var(--info)'], ['Gross', fmtI(s.gross), 'var(--text)'],
             ['Discount', fmtI(s.discount), 'var(--warn)'], ['Net', fmtI(s.net), 'var(--accent)']].map(([l,v,c2]) =>
            `<div class="stat-card"><div class="stat-val" style="color:${c2}">${v}</div><div class="stat-lbl">${l}</div></div>`
          ).join('')}
        </div>
        <table class="tbl"><thead><tr><th>Date</th><th>Bills</th><th>Subtotal</th><th>Discount</th><th>GST</th><th>Total</th><th>Cash</th><th>UPI</th></tr></thead>
        <tbody>${(data.rows || []).map(r => `<tr>
          <td style="font-family:monospace">${r.day}</td><td>${r.bill_count}</td>
          <td>${fmt(r.subtotal)}</td><td style="color:var(--warn)">-${fmt(r.discount)}</td>
          <td>${fmt(r.gst)}</td><td style="font-weight:700;color:var(--accent)">${fmt(r.total)}</td>
          <td>${fmt(r.cash)}</td><td>${fmt(r.upi)}</td>
        </tr>`).join('')}</tbody></table>
      </div>`;
      window._reportData = { rows: data.rows, headers: ['day','bill_count','subtotal','discount','gst','total','cash','upi'] };
    } else if (id === 'staff_perf') {
      const data = await GET(`/reports/staff_performance?from_date=${monthStart}&to_date=${today}`);
      out.innerHTML = `<div class="card gap-16">
        <div class="flex-between">
          <div class="section-title">Staff Performance — This Month</div>
          <button class="btn btn-outline btn-sm" onclick="csvDl('staff_perf')">⬇ CSV</button>
        </div>
        <table class="tbl"><thead><tr><th>Employee Name</th><th>Username</th><th>Bills Generated</th><th>Total Sales</th><th>Discounts Given</th></tr></thead>
        <tbody>${(data || []).map(r => `<tr>
          <td style="font-weight:700;color:var(--text)">${r.name}</td>
          <td style="font-size:12px;color:var(--muted)">${r.username}</td>
          <td style="font-weight:800">${r.bills_count}</td>
          <td style="font-weight:800;color:var(--accent)">${fmt(r.total_sales)}</td>
          <td style="color:var(--warn)">${fmt(r.total_discounts)}</td>
        </tr>`).join('')}
        ${!data.length ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted)">No staff sales data found.</td></tr>' : ''}
        </tbody></table>
      </div>`;
      window._reportData = { rows: data, headers: ['id', 'username', 'name', 'bills_count', 'total_sales', 'total_discounts'] };
    } else if (id === 'drugwise') {
      const data = await GET(`/reports/drugwise?from_date=${monthStart}&to_date=${today}`);
      out.innerHTML = `<div class="card gap-12">
        <div class="flex-between"><div class="section-title">Drug-wise Sales — This Month</div>
          <button class="btn btn-outline btn-sm" onclick="csvDl('drugwise')">⬇ CSV</button></div>
        <table class="tbl"><thead><tr><th>#</th><th>Drug</th><th>Category</th><th>Units Sold</th><th>Bills</th><th>Revenue</th></tr></thead>
        <tbody>${data.map((r, i) => `<tr>
          <td style="color:var(--muted)">${i + 1}</td>
          <td><div style="font-weight:700">${r.name}</div><div style="font-size:11px;color:var(--muted)">${r.brand || ''}</div></td>
          <td style="color:var(--muted);font-size:12px">${r.category || '—'}</td>
          <td style="font-weight:700">${r.tablets_sold}</td><td>${r.bill_count}</td>
          <td style="font-weight:800;color:var(--accent)">${fmt(r.revenue)}</td>
        </tr>`).join('')}</tbody></table>
      </div>`;
      window._reportData = { rows: data, headers: ['name','brand','category','tablets_sold','bill_count','revenue'] };

    } else if (id === 'stock_value') {
      const data = await GET('/reports/stock_value');
      out.innerHTML = `<div class="card gap-12">
        <div class="flex-between">
          <div class="section-title">Stock Value Report</div>
          <button class="btn btn-outline btn-sm" onclick="csvDl('stockval')">⬇ CSV</button>
        </div>
        <div class="grid-2">
          <div class="stat-card"><div class="stat-val" style="color:var(--info)">${fmtI(data.total_cost)}</div><div class="stat-lbl">Cost Value</div></div>
          <div class="stat-card"><div class="stat-val" style="color:var(--accent)">${fmtI(data.total_mrp)}</div><div class="stat-lbl">MRP Value</div></div>
        </div>
        <table class="tbl"><thead><tr><th>Drug</th><th>Category</th><th>Strips</th><th>Cost Value</th><th>MRP Value</th></tr></thead>
        <tbody>${data.rows.map(r => `<tr>
          <td><div style="font-weight:700">${r.name}</div><div style="font-size:11px;color:var(--muted)">${r.brand || ''}</div></td>
          <td style="color:var(--muted);font-size:12px">${r.category || '—'}</td>
          <td>${r.full_strips}</td>
          <td style="color:var(--info)">${fmt(r.cost_value)}</td>
          <td style="font-weight:700;color:var(--accent)">${fmt(r.mrp_value)}</td>
        </tr>`).join('')}</tbody></table>
      </div>`;
      window._reportData = { rows: data.rows, headers: ['name','brand','category','full_strips','cost_value','mrp_value'] };

    } else if (id === 'pl') {
      const data = await GET(`/reports/pl?from_date=${monthStart}&to_date=${today}`);
      const gp   = data.gross_profit || 0;
      out.innerHTML = `<div class="card gap-16">
        <div class="section-title">Profit & Loss — This Month</div>
        <div class="grid-4" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          ${[['Revenue', fmtI(data.net_revenue), 'var(--accent)'],
             ['COGS', fmtI(data.cogs), 'var(--warn)'],
             ['Gross Profit', fmtI(gp), gp >= 0 ? 'var(--green)' : 'var(--danger)'],
             ['Margin', data.margin_pct + '%', gp >= 0 ? 'var(--green)' : 'var(--danger)']].map(([l,v,col]) =>
            `<div class="stat-card"><div class="stat-val" style="color:${col}">${v}</div><div class="stat-lbl">${l}</div></div>`
          ).join('')}
        </div>
        <div class="alert-strip ${gp >= 0 ? 'success' : 'danger'}">
          ${gp >= 0 ? '✅' : '⚠️'} Gross profit this month: <b>${fmtI(gp)}</b> at <b>${data.margin_pct}% margin</b>
        </div>
      </div>`;

    } else if (id === 'gstr1') {
      const data = await GET('/reports/gstr1?month=' + thisMonth);
      out.innerHTML = `<div class="card gap-12">
        <div class="flex-between"><div class="section-title">GSTR-1 · ${thisMonth}</div>
          <button class="btn btn-outline btn-sm" onclick="csvDl('gstr1')">⬇ CSV</button></div>
        <table class="tbl"><thead><tr><th>Bill No.</th><th>Date</th><th>Customer</th><th>HSN Code(s)</th><th>Taxable</th><th>GST</th><th>Total</th></tr></thead>
        <tbody>${data.map(r => `<tr>
          <td style="font-family:monospace;font-weight:700">${r.bill_no}</td>
          <td style="font-size:12px;color:var(--muted)">${r.created_at?.slice(0, 10)}</td>
          <td>${r.customer || 'Walk-in'}</td>
          <td style="font-family:monospace;font-size:11px;color:var(--info)">${r.hsn_codes || '—'}</td>
          <td>${fmt(r.taxable)}</td><td>${fmt(r.gst_amt)}</td>
          <td style="font-weight:700;color:var(--accent)">${fmt(r.total)}</td>
        </tr>`).join('')}</tbody></table>
      </div>`;
      window._reportData = { rows: data, headers: ['bill_no','created_at','customer','hsn_codes','taxable','gst_amt','total'] };

    } else if (id === 'expiry') {
      const data = await GET('/reports/expiry');
      out.innerHTML = `<div class="card gap-12">
        <div class="flex-between"><div class="section-title">Expiry Report</div>
          <button class="btn btn-outline btn-sm" onclick="csvDl('expiry')">⬇ CSV</button></div>
        <table class="tbl"><thead><tr><th>Drug</th><th>Batch</th><th>Expiry</th><th>Strips</th><th>Location</th><th>Status</th></tr></thead>
        <tbody>${data.map(r => `<tr>
          <td><div style="font-weight:700">${r.name}</div><div style="font-size:11px;color:var(--muted)">${r.brand || ''}</div></td>
          <td style="font-family:monospace;font-size:12px">${r.batch_no}</td>
          <td style="color:${expiryColor(r.expiry)};font-weight:700">${fmtExp(r.expiry)}</td>
          <td>${r.full_strips}</td>
          <td style="color:var(--accent)">Box ${r.box_id || '—'}</td>
          <td>${expiryTag(r.expiry)}</td>
        </tr>`).join('')}</tbody></table>
      </div>`;
      window._reportData = { rows: data, headers: ['name','brand','batch_no','expiry','full_strips','box_id'] };
    } else if (id === 'schedule_log') {
      const data = await GET(`/reports/schedule_log?from_date=${monthStart}&to_date=${today}`);
      out.innerHTML = `<div class="card gap-12">
        <div class="flex-between"><div class="section-title">Schedule H/H1/X Register</div>
          <button class="btn btn-outline btn-sm" onclick="csvDl('schedule_log')">⬇ CSV</button></div>
        <table class="tbl"><thead><tr><th>Date</th><th>Bill No</th><th>Patient</th><th>Doctor / Rx</th><th>Drug</th><th>Schedule</th><th>Qty Sold</th></tr></thead>
        <tbody>${data.map((r, i) => `<tr>
          <td style="font-size:12px;color:var(--muted)">${r.bill_date?.slice(0, 10)}</td>
          <td style="font-family:monospace;font-weight:700">${r.bill_no}</td>
          <td>${r.patient_name || 'Walk-in'}</td>
          <td style="font-size:11px">${r.doctor ? r.doctor + '<br>' : ''}<span style="color:var(--muted)">${r.rx_no || '—'}</span></td>
          <td><div style="font-weight:700">${r.drug_name}</div><div style="font-size:11px;color:var(--muted)">${r.brand || ''}</div></td>
          <td><span class="tag tag-red">${r.schedule}</span></td>
          <td style="font-weight:800;color:var(--danger)">${r.tablets_qty}</td>
        </tr>`).join('')}
        ${!data.length ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">No controlled substances dispensed in this period.</td></tr>' : ''}
        </tbody></table>
      </div>`;
      window._reportData = { rows: data, headers: ['bill_date','bill_no','patient_name','doctor','rx_no','drug_name','brand','schedule','tablets_qty'] };

    } else if (id === 'dayclose') {
      const d = await GET('/reports/dayclose');
      const gross = d.gross_sales || 0;
      const draws = (d.cash_sales || 0) - (d.total_refunds || 0);

      out.innerHTML = `<h3>Day Close (Z-Report) — ${new Date().toLocaleDateString('en-IN')}</h3>
      <div class="grid-2" style="margin-top:14px">
        <div class="card gap-12">
          <div class="section-title">Sales Summary</div>
          <div class="flex-between"><span>Total Bills</span><span style="font-weight:700">${d.bill_count || 0}</span></div>
          <div class="flex-between"><span>Gross Sales</span><span style="font-weight:700">₹${gross.toFixed(2)}</span></div>
          <div class="flex-between" style="color:var(--warn)"><span>Total Discount</span><span>-₹${(d.total_discount || 0).toFixed(2)}</span></div>
          <div class="flex-between" style="color:var(--muted);font-size:12px"><span>GST Collected</span><span>₹${(d.total_gst || 0).toFixed(2)}</span></div>
        </div>
        <div class="card gap-12">
          <div class="section-title">Collections</div>
          <div class="flex-between"><span>Cash Sales</span><span>₹${(d.cash_sales || 0).toFixed(2)}</span></div>
          <div class="flex-between" style="color:var(--info)"><span>UPI</span><span>₹${(d.upi_sales || 0).toFixed(2)}</span></div>
          <div class="flex-between" style="color:var(--green)"><span>Card</span><span>₹${(d.card_sales || 0).toFixed(2)}</span></div>
          <div class="flex-between" style="color:var(--warn)"><span>Credit</span><span>₹${(d.credit_sales || 0).toFixed(2)}</span></div>
          <div style="height:1px;background:var(--border);margin:4px 0"></div>
          <div class="flex-between" style="color:var(--danger)"><span>Returns/Refunds (${d.return_count})</span><span>-₹${(d.total_refunds || 0).toFixed(2)}</span></div>
        </div>
      </div>
      <div class="card" style="margin-top:14px;background:var(--accent-dim);border-color:var(--accent);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:12px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:1px">Expected Cash in Drawer</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">(Cash Sales - Cash Refunds)</div>
        </div>
        <div style="font-size:28px;font-weight:900;color:var(--accent)">₹${d.net_cash?.toFixed(2) || '0.00'}</div>
      </div>
      <button class="btn btn-primary" style="margin-top:16px" onclick="toast('Z-Report Printed')">🖨️ Print Z-Report</button>`;
    }
  };

  window.csvDl = (type) => {
    if (!window._reportData) return;
    csvDownload(`pharmapro_${type}_${today}.csv`, window._reportData.rows, window._reportData.headers);
  };
}
