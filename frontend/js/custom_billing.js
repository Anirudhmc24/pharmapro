import { GET, POST } from './api.js';
import { fmt, fmtI, toast, csvDownload } from './utils.js';

export async function renderCustomBilling(c, APP) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  
  c.innerHTML = `<div class="gap-16 fade-in">
    <h2 style="font-size:18px;font-weight:800">Custom Bill Generation</h2>
    <div class="card gap-16">
      <div class="section-title">Generate Random Bills</div>
      <div class="alert-strip info">
        ℹ️ This will generate random bills to match the target amount for the specified month. Stock will NOT be deducted.
      </div>
      <div class="grid-2">
        <div class="field">
          <label>Month</label>
          <input type="month" id="sim-month" class="input" value="${thisMonth}">
        </div>
        <div class="field">
          <label>Target Amount (₹)</label>
          <input type="number" id="sim-amount" class="input" placeholder="e.g. 50000">
        </div>
      </div>
      <button class="btn btn-primary" id="btn-generate" onclick="generateSimBills()">🎲 Generate Bills</button>
      <div id="sim-results"></div>
    </div>
    
    <div class="card gap-16">
      <div class="section-title">Export Reports</div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-outline" onclick="dlGstr1Json()">⬇ Download GSTR1 JSON</button>
        <button class="btn btn-outline" onclick="dlSalesCsv()">⬇ Download Sales CSV</button>
        <button class="btn btn-outline" onclick="dlPurchaseCsv()">⬇ Download Purchase CSV</button>
      </div>
    </div>
  </div>`;

  window.generateSimBills = async () => {
    const month = document.getElementById('sim-month').value;
    const amount = parseFloat(document.getElementById('sim-amount').value);
    
    if (!month || !amount || amount <= 0) {
      toast('Please enter valid month and amount', 'error');
      return;
    }
    
    const btn = document.getElementById('btn-generate');
    const res = document.getElementById('sim-results');
    
    btn.disabled = true;
    btn.textContent = 'Generating…';
    res.innerHTML = '<div class="spinner"></div> Generating bills, please wait…';
    
    try {
      const data = await POST('/simulation/generate_bills', { month, target_amount: amount });
      if (data.success) {
        toast(`Successfully generated ${data.bills_created} bills!`, 'success');
        res.innerHTML = `<div class="alert-strip success">
          ✅ <b>Success!</b> Generated ${data.bills_created} bills totaling <b>₹${data.total_amount.toFixed(2)}</b> (Target: ₹${data.target_amount.toFixed(2)}).
        </div>`;
      } else {
        throw new Error(data.error || 'Failed to generate bills');
      }
    } catch (e) {
      toast(e.message, 'error');
      res.innerHTML = `<div class="alert-strip danger">⚠️ Error: ${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '🎲 Generate Bills';
    }
  };

  window.dlGstr1Json = async () => {
    const month = document.getElementById('sim-month').value;
    if (!month) { toast('Please select a month', 'error'); return; }
    
    try {
      const data = await GET(`/reports/gstr1?month=${month}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gstr1_${month}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('GSTR1 JSON downloaded');
    } catch (e) {
      toast('Failed to download GSTR1 JSON', 'error');
    }
  };

  window.dlSalesCsv = async () => {
    const month = document.getElementById('sim-month').value;
    if (!month) { toast('Please select a month', 'error'); return; }
    
    try {
      const from_date = `${month}-01`;
      // Get last day of month
      const parts = month.split('-');
      const lastDay = new Date(parts[0], parts[1], 0).getDate();
      const to_date = `${month}-${lastDay}`;
      
      const data = await GET(`/reports/sales?from_date=${from_date}&to_date=${to_date}`);
      if (data.rows && data.rows.length > 0) {
        const headers = ['day', 'bill_count', 'subtotal', 'discount', 'gst', 'total', 'cash', 'upi'];
        csvDownload(`sales_${month}.csv`, data.rows, headers);
        toast('Sales CSV downloaded');
      } else {
        toast('No sales data found for this month', 'warn');
      }
    } catch (e) {
      toast('Failed to download Sales CSV', 'error');
    }
  };

  window.dlPurchaseCsv = async () => {
    try {
      const data = await GET('/purchase_orders');
      if (data && data.length > 0) {
        const headers = ['po_no', 'supplier_name', 'status', 'total_amt', 'created_at', 'received_at'];
        csvDownload('purchase_orders.csv', data, headers);
        toast('Purchase CSV downloaded');
      } else {
        toast('No purchase data found', 'warn');
      }
    } catch (e) {
      toast('Failed to download Purchase CSV', 'error');
    }
  };
}
