// catalogue.js — Master Drug Catalogue (250k+ medicines)
import { GET, POST } from './api.js';
import { toast, modal, closeModal } from './utils.js';

export async function renderCatalogue(c, APP) {
  let query = '';
  let currentPage = 1;
  let totalCount = 0;
  const LIMIT = 50;

  // ── Render shell immediately ──────────────────────────────
  c.innerHTML = `<div class="gap-16 fade-in">
    <div class="flex-between">
      <div>
        <h2 style="font-size:18px;font-weight:800;margin-bottom:2px">📚 Master Drug Catalogue</h2>
        <div id="cat-subtitle" style="color:var(--muted);font-size:12px">Loading 253,000+ medicines…</div>
      </div>
    </div>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input class="input" id="cat-search" placeholder="Search any medicine (e.g. Glycomet, Augmentin, Metformin)…"
        style="padding-left:36px" oninput="handleCatSearch(this.value)" autocomplete="off">
    </div>
    <div id="cat-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      <div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--muted)">
        <div class="spinner" style="margin:0 auto 12px"></div>
        <div>Loading alphabetical list…</div>
      </div>
    </div>
    <div id="cat-pagination" style="display:flex;justify-content:center;gap:8px;margin-top:8px"></div>
  </div>`;

  // ── Wire up global handlers ───────────────────────────────
  let searchTimer = null;
  window.handleCatSearch = (v) => {
    clearTimeout(searchTimer);
    query = v.trim();
    currentPage = 1;
    if (query.length === 0) {
      searchTimer = setTimeout(() => loadPage(1), 100);
    } else if (query.length >= 2) {
      searchTimer = setTimeout(() => doSearch(query), 300);
    }
  };

  window.catGoPage = (p) => {
    currentPage = p;
    if (query.length >= 2) {
      doSearch(query);
    } else {
      loadPage(p);
    }
  };

  window.importToCatalogue = async (name, manufacturer, composition, mrp) => {
    // Navigate to inventory and open Add Drug modal pre-filled
    APP.navigate('inventory');
    setTimeout(() => {
      window.showAddDrug && window.showAddDrug();
      setTimeout(() => {
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('ad-name', name);
        setVal('ad-brand', manufacturer);
        setVal('ad-comp', composition);
        setVal('ad-mrps', mrp || 0);
        toast('Drug details pre-filled from Master Catalogue!', 'info');
      }, 150);
    }, 150);
  };

  // ── Load alphabetical page ────────────────────────────────
  async function loadPage(page) {
    setGridLoading();
    try {
      const data = await GET(`/drugs/master_all?page=${page}&limit=${LIMIT}`);
      totalCount = data.total;
      document.getElementById('cat-subtitle').textContent =
        `${totalCount.toLocaleString()} medicines in the master database · Showing page ${page}`;
      renderCards(data.items);
      renderPagination(page, Math.ceil(totalCount / LIMIT));
    } catch (e) {
      showError('Failed to load catalogue. Make sure the app is running. (' + e.message + ')');
    }
  }

  // ── Search ────────────────────────────────────────────────
  async function doSearch(q) {
    setGridLoading();
    try {
      const results = await GET(`/drugs/master_search?q=${encodeURIComponent(q)}`);
      if (!Array.isArray(results)) {
        showError('Unexpected response from server.');
        return;
      }
      document.getElementById('cat-subtitle').textContent =
        results.length ? `Found ${results.length} results for "${q}"` : `No results for "${q}"`;
      renderCards(results);
      document.getElementById('cat-pagination').innerHTML = '';
    } catch (e) {
      showError('Search failed: ' + e.message);
    }
  }

  // ── Render helpers ────────────────────────────────────────
  function setGridLoading() {
    document.getElementById('cat-grid').innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--muted)">
        <div class="spinner" style="margin:0 auto 12px"></div>
        <div>Searching…</div>
      </div>`;
  }

  function showError(msg) {
    document.getElementById('cat-grid').innerHTML = `
      <div style="grid-column:1/-1;padding:32px">
        <div class="alert-strip danger">❌ ${msg}</div>
      </div>`;
  }

  function renderCards(items) {
    const grid = document.getElementById('cat-grid');
    if (!items || items.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--muted)">
        <div style="font-size:36px;margin-bottom:12px">💊</div>
        <div>No medicines found. Try a different search term.</div>
      </div>`;
      return;
    }

    grid.innerHTML = items.map(d => {
      const name = (d.name || '').replace(/'/g, '&#39;');
      const mfr  = (d.manufacturer || '').replace(/'/g, '&#39;');
      const comp = (d.composition || '').replace(/'/g, '&#39;');
      const mrp  = d.mrp || 0;
      const compShort = comp.length > 60 ? comp.substring(0, 60) + '…' : comp;

      return `<div class="card fade-in" style="display:flex;flex-direction:column;gap:8px">
        <div style="font-weight:800;color:var(--accent);font-size:14px;line-height:1.3">${d.name || '—'}</div>
        <div style="font-size:11px;color:var(--muted);font-weight:600">${d.manufacturer || '—'}</div>
        <div style="font-size:12px;color:var(--text);line-height:1.5;flex:1">${compShort || '—'}</div>
        <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700;color:var(--text)">MRP: ₹${mrp > 0 ? mrp.toFixed(2) : '—'}</div>
          <button class="btn btn-primary btn-sm"
            onclick="importToCatalogue('${name}','${mfr}','${comp}',${mrp})">
            + Add to Shop
          </button>
        </div>
      </div>`;
    }).join('');
  }

  function renderPagination(current, totalPages) {
    const el = document.getElementById('cat-pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    const btnStyle = (active) =>
      `style="padding:6px 14px;border-radius:8px;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};background:${active ? 'var(--accent-dim)' : 'var(--card)'};color:${active ? 'var(--accent)' : 'var(--muted)'};cursor:pointer;font-weight:${active ? 800 : 500};font-size:13px"`;

    // Prev
    if (current > 1)
      html += `<button ${btnStyle(false)} onclick="catGoPage(${current - 1})">← Prev</button>`;

    // Page numbers (window of 5)
    const start = Math.max(1, current - 2);
    const end   = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++)
      html += `<button ${btnStyle(i === current)} onclick="catGoPage(${i})">${i}</button>`;

    // Next
    if (current < totalPages)
      html += `<button ${btnStyle(false)} onclick="catGoPage(${current + 1})">Next →</button>`;

    el.innerHTML = html;
  }

  // ── Boot: load first page ─────────────────────────────────
  await loadPage(1);
}
