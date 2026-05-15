// utils.js — shared helpers used by all page modules
export const fmt  = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtI = n => '₹' + Math.round(n).toLocaleString('en-IN');
export const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const monthsLeft = ym => { if (!ym) return 99; const [y, m] = ym.split('-').map(Number); return (new Date(y, m - 1, 1) - new Date()) / (1000 * 60 * 60 * 24 * 30); };
export const fmtExp = ym => { if (!ym) return ''; const [y, m] = ym.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] + ' ' + y; };
export const expiryColor = ym => { const ml = monthsLeft(ym); if (ml <= 0) return 'var(--danger)'; if (ml <= 3) return 'var(--warn)'; return 'var(--green)'; };
export const breakdown = drug => { const tps = drug.tablets_per_strip || 10; return { full: Math.floor((drug.stock_tablets || 0) / tps), broken: (drug.stock_tablets || 0) % tps, tps }; };

export function tag(label, cls) { return `<span class="tag ${cls}">${label}</span>`; }

export function expiryTag(ym) {
  const ml = monthsLeft(ym);
  if (ml <= 0)  return tag('⛔ Expired', 'tag-red');
  if (ml <= 3)  return tag(`⚠️ ${Math.round(ml)}mo left`, 'tag-amber');
  if (ml <= 6)  return tag(`${Math.round(ml)}mo left`, 'tag-amber');
  return tag('OK', 'tag-green');
}

export function stripVis(total, filled, color) {
  let h = '<div class="strip-vis">';
  for (let i = 0; i < total; i++)
    h += `<div class="strip-cell" style="background:${i < filled ? color : 'var(--faint)'};border:1px solid ${i < filled ? color + '88' : 'var(--border)'}"></div>`;
  return h + '</div>';
}

export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function modal(titleHTML, bodyHTML, footerHTML = '') {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `<div class="modal">
    <div class="modal-title">${titleHTML}</div>
    <div class="gap-12">${bodyHTML}</div>
    ${footerHTML ? `<div style="display:flex;gap:10px;margin-top:16px">${footerHTML}</div>` : ''}
  </div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  return m;
}

export function closeModal() {
  document.querySelector('.modal-overlay')?.remove();
}

export function spinner() {
  return '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
}

export function formatDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function csvDownload(filename, rows, headers) {
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
