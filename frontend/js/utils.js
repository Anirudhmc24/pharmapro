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
  m.addEventListener('click', e => { 
    if (e.target === m) {
      m.remove();
      if (window.updateAndroidBackState) window.updateAndroidBackState();
    }
  });
  document.body.appendChild(m);
  if (window.updateAndroidBackState) window.updateAndroidBackState();
  return m;
}

export function closeModal() {
  document.querySelector('.modal-overlay')?.remove();
  if (window.updateAndroidBackState) window.updateAndroidBackState();
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

/**
 * Compresses an image file by resizing it and converting to JPEG.
 * @param {File} file - The raw input file (from input element or drag/drop)
 * @param {number} maxW - Maximum width in pixels (default 1600)
 * @param {number} maxH - Maximum height in pixels (default 1600)
 * @param {number} quality - JPEG compression quality 0.0 to 1.0 (default 0.8)
 * @returns {Promise<string>} - Resolves with base64 encoded string of compressed JPEG (no prefix)
 */
export function compressImage(file, maxW = 1600, maxH = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const b64 = dataUrl.split(',')[1];
        resolve(b64);
      };
      img.onerror = (err) => reject(new Error("Failed to load image for compression."));
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

