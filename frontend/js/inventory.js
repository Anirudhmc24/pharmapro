// inventory.js — Inventory page + drug edit + expiry return
import { GET, POST, PUT } from './api.js';
import { fmt, fmtI, tag, expiryTag, expiryColor, fmtExp, monthsLeft, breakdown, toast, modal, closeModal } from './utils.js';

export async function renderInventory(c, APP) {
  const [drugsData, layoutData] = await Promise.all([
    GET('/inventory'),
    GET('/layout').catch(() => [])
  ]);
  let drugs = drugsData;
  window._layout = layoutData;
  let filter = '';
  let activeTab = 'stock';
  let activeCategoryFilter = 'All';
  let problemQuery = '';
  let problemResults = [];
  let activeSegment = 'middle_aged_men';
  let selectedDrugIds = new Set();


  function filteredDrugs() {
    let list = drugs;
    if (activeCategoryFilter !== 'All') {
      const cat = activeCategoryFilter.toLowerCase();
      list = list.filter(d => {
        const dcat = (d.category || '').toLowerCase();
        if (cat === 'ointments') {
          return dcat === 'ointment' || dcat === 'ointments';
        }
        if (cat === 'creams') {
          return dcat === 'cream' || dcat === 'creams';
        }
        return dcat === cat;
      });
    }
    if (!filter) return list;
    const q = filter.toLowerCase();
    return list.filter(d => (d.name + (d.brand || '') + (d.category || '') + (d.rack || '')).toLowerCase().includes(q));
  }

  function html() {
    return `<div class="gap-16 fade-in">
      <div class="flex-between">
        <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Inventory</h2>
          <div style="color:var(--muted);font-size:12px">${drugs.length} drugs · Tablet-level tracking</div></div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-outline btn-sm" id="enrich-btn" onclick="triggerEnrichment()" style="white-space: nowrap;">🪄 Enrich Inventory</button>
          <button class="btn btn-outline btn-sm" onclick="showExpiringManager()">Return Expiring Stock</button>
          <button class="btn btn-primary btn-sm" onclick="showAddDrug()">+ Add Drug</button>
        </div>
      </div>
      
      <!-- Tab Header -->
      <div style="display:flex;gap:4px;border-bottom:2px solid var(--border);margin-bottom:16px">
        <button onclick="setInventoryTab('stock')" class="btn" style="border-bottom-left-radius:0;border-bottom-right-radius:0;margin-bottom:-2px;border:none;background:none;border-bottom:3px solid ${activeTab === 'stock' ? 'var(--accent)' : 'transparent'};color:${activeTab === 'stock' ? 'var(--accent)' : 'var(--muted)'};font-weight:800;padding:8px 16px;box-shadow:none">📋 Stock List</button>
        <button onclick="setInventoryTab('problem')" class="btn" style="border-bottom-left-radius:0;border-bottom-right-radius:0;margin-bottom:-2px;border:none;background:none;border-bottom:3px solid ${activeTab === 'problem' ? 'var(--accent)' : 'transparent'};color:${activeTab === 'problem' ? 'var(--accent)' : 'var(--muted)'};font-weight:800;padding:8px 16px;box-shadow:none">🔍 Search by Problem / Symptom</button>
      </div>

      <!-- Enrichment Progress Bar -->
      <div id="enrichment-status-area" class="card-sm" style="display:none; background:var(--accent-dim); border: 1px solid var(--accent); margin-bottom: 16px; padding: 12px 16px;">
        <div id="enrichment-progress-text" style="font-weight:700; font-size:12px; color:var(--accent); margin-bottom: 8px;">Progress: Checking...</div>
        <div class="progress" style="height:6px"><div id="enrichment-progress-bar" class="progress-bar" style="width: 0%; height:100%"></div></div>
      </div>

      <div id="inv-tab-content">${renderTabContent()}</div>
    </div>`;
  }

  function renderTabContent() {
    if (activeTab === 'stock') {
      const list = filteredDrugs();
      return `<div class="gap-16">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input class="input" id="inv-filter" placeholder="Filter by name, brand, category, rack…" value="${filter}" oninput="invFilter(this.value)">
        </div>
        <div style="display:flex;gap:6px;margin-top:12px;margin-bottom:6px;flex-wrap:wrap">
          ${['All', 'Ethical', 'Generic', 'Ointments', 'Creams'].map(cat => `
            <button onclick="setInventoryCategory('${cat}')" class="btn ${activeCategoryFilter === cat ? 'btn-primary' : 'btn-outline'}" style="padding:4px 10px;font-size:11px;border-radius:14px;font-weight:700;box-shadow:none">
              ${cat}
            </button>
          `).join('')}
        </div>

        <!-- Bulk Action Bar -->
        <div id="inv-bulk-bar" class="card-sm" style="display:none; background:var(--accent-dim); border: 2px solid var(--accent); padding:10px 16px; margin-top:12px; margin-bottom:12px; border-radius:8px; justify-content:space-between; align-items:center;">
          <div style="font-weight:700; font-size:13px; color:var(--text)">
            Selected <span id="bulk-selected-count">0</span> items
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
            <span style="font-size:12px; color:var(--muted)">Move selected items to:</span>
            <select class="select select-sm" id="bulk-cat-select" style="padding:4px 8px; font-size:11px; width:auto; border-radius:6px; height:32px;">
              <option value="Ethical">Ethical (Ethnic)</option>
              <option value="Generic">Generic</option>
              <option value="Ointment">Ointment (Ointments)</option>
              <option value="Cream">Cream (Creams)</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="window.applyBulkCategoryMove()" style="padding:4px 12px; font-size:11px; font-weight:700; border-radius:6px; height:32px;">Move Items</button>
          </div>
        </div>

        <div class="card" style="padding:0;overflow:auto;margin-top:12px">
          <table class="tbl" id="inv-table">
            <thead>
              <tr>
                <th style="width:40px; text-align:center;"><input type="checkbox" id="inv-select-all" onchange="window.toggleAllInvCheckbox(this.checked)"></th>
                <th>Drug / Brand</th>
                <th>Category</th>
                <th>Location</th>
                <th>Stock</th>
                <th>Nearest Expiry</th>
                <th>MRP/tab</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${list.map(d => invRow(d)).join('')}</tbody>
          </table>
          ${list.length === 0 ? '<div style="padding:40px;text-align:center;color:var(--muted)">No drugs found</div>' : ''}
        </div>
      </div>`;
    } else {
      return `<div class="gap-16">
        <div class="flex-between" style="align-items: center; margin-bottom: 8px;">
          <div style="color:var(--muted);font-size:13px;">
            Search symptoms, problems, or indications (e.g. "cough", "headache", "fever") to find suitable medicines in your stock.
          </div>
        </div>

        <div class="search-wrap" style="margin-bottom:16px">
          <span class="search-icon">🔍</span>
          <input class="input" id="prob-search-input" placeholder="Type problem/symptom (e.g. fever, headache)…" value="${problemQuery}" oninput="probSearch(this.value)" autofocus>
        </div>
        <div id="problem-results-area">
          ${renderProblemResults()}
        </div>
      </div>`;
    }
  }

  window.setProblemSegment = (seg) => {
    activeSegment = seg;
    const resultsArea = document.getElementById('problem-results-area');
    if (resultsArea) {
      resultsArea.innerHTML = renderProblemResults();
    }
  };

  function renderProblemResults() {
    if (problemQuery.length < 2) {
      return `<div style="text-align:center;padding:48px;color:var(--muted)">
        <div style="font-size:48px;margin-bottom:12px">🔍</div>
        <div>Type 2 or more characters to search matching medicines...</div>
      </div>`;
    }
    if (problemResults.length === 0) {
      return `<div style="text-align:center;padding:48px;color:var(--muted)">
        <div style="font-size:48px;margin-bottom:12px">💊</div>
        <div>No matching medicines found for "${problemQuery}" in your inventory.</div>
      </div>`;
    }

    const segments = [
      { id: 'child', label: '👶 Kids / Children' },
      { id: 'middle_aged_men', label: '👨 Adult Men' },
      { id: 'middle_aged_women', label: '👩 Adult Women' },
      { id: 'elderly_men', label: '👴 Senior Men' },
      { id: 'elderly_women', label: '👵 Senior Women' }
    ];

    const segmentButtons = `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${segments.map(seg => `
          <button onclick="setProblemSegment('${seg.id}')" class="btn ${activeSegment === seg.id ? 'btn-primary' : 'btn-outline'}" style="padding:6px 12px;font-size:12px;border-radius:20px;font-weight:700">
            ${seg.label}
          </button>
        `).join('')}
      </div>
    `;

    // Filter results for the active segment
    const filtered = [];
    let unclassifiedCount = 0;
    
    problemResults.forEach(d => {
      let suitability = null;
      try {
        if (d.age_suitability) {
          suitability = JSON.parse(d.age_suitability);
        }
      } catch (e) {}

      if (suitability) {
        let segData = suitability[activeSegment];
        if (!segData) {
          // Map to legacy categories if the new categories don't exist yet in the JSON
          if (activeSegment === 'child' && suitability.child) {
            segData = suitability.child;
          } else if ((activeSegment === 'middle_aged_men' || activeSegment === 'middle_aged_women') && suitability.adult) {
            segData = suitability.adult;
          } else if ((activeSegment === 'elderly_men' || activeSegment === 'elderly_women') && suitability.elderly) {
            segData = suitability.elderly;
          }
        }

        if (segData && segData.ok) {
          filtered.push({ drug: d, dose: segData.dose });
        }
        
        if (!suitability.child?.ok && !suitability.middle_aged_men?.ok && !suitability.middle_aged_women?.ok && !suitability.elderly_men?.ok && !suitability.elderly_women?.ok && !suitability.adult?.ok && !suitability.elderly?.ok) {
          unclassifiedCount++;
        }
      } else {
        // If suitability is not set, default to allowing adults/seniors
        unclassifiedCount++;
        if (activeSegment !== 'child') {
          filtered.push({ drug: d, dose: d.administration || "Standard dose" });
        }
      }
    });

    if (filtered.length === 0) {
      return `
        ${segmentButtons}
        ${unclassifiedCount > 0 ? `
          <div class="alert-strip info" style="margin-bottom: 14px; font-size: 11px; padding: 8px 12px;">
            ℹ️ Some medicines are missing detailed age suitability data. Click "Enrich Inventory with AI" above to enrich your stock.
          </div>
        ` : ''}
        <div style="text-align:center;padding:32px;color:var(--muted);background:var(--faint);border-radius:12px;border:1px solid var(--border)">
          No matching medicines in stock found suitable for this category.
        </div>
      `;
    }

    const cardsHtml = filtered.map(({ drug: d, dose }) => {
      const inStock = (d.stock_tablets || 0) > 0;
      
      let shelfText = "No location assigned";
      if (d.box_id && window._layout) {
        for (let f of window._layout) {
          for (let c of (f.compartments || [])) {
            for (let b of (c.boxes || [])) {
              if (b.id === d.box_id) {
                shelfText = `${f.name} › ${c.name} › ${b.name}`;
                break;
              }
            }
          }
        }
      }

      return `
        <div class="card" style="border-left: 5px solid ${inStock ? 'var(--accent)' : 'var(--danger)'}; background: var(--surface); padding: 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: var(--shadow-sm);">
          <div class="flex-between">
            <div>
              <h3 style="margin:0;font-size:15px;font-weight:800;color:var(--text)">${d.name}</h3>
              <div style="font-size:11px;color:var(--muted)">Brand: ${d.brand || '—'} · Category: ${d.category || '—'}</div>
            </div>
            <div style="text-align:right">
              <span class="tag ${inStock ? 'tag-green' : 'tag-red'}" style="font-size:11px;font-weight:800;padding:2px 8px">
                ${d.stock_tablets || 0} tabs in stock
              </span>
              <div style="font-size:11px;color:var(--muted);margin-top:4px">MRP: ₹${d.mrp_per_tablet?.toFixed(2) || '0.00'}/tab</div>
            </div>
          </div>
          
          ${d.composition ? `
            <div style="font-size:12px;background:var(--faint);padding:6px 10px;border-radius:6px;color:var(--text);margin-top:4px">
              <b>Composition:</b> ${d.composition}
            </div>
          ` : ''}

          <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
            <div style="font-size:12px;color:var(--text)">
              <b>📍 Location:</b> <strong style="color:var(--accent)">${shelfText}</strong>
            </div>
            
            <div style="font-size:12px;color:var(--text)">
              <b>📋 Target Symptoms / Indications:</b> ${d.indications || '—'}
            </div>

            <div style="font-size:12px;color:var(--text);border-top:1px dashed var(--border);padding-top:6px;margin-top:4px">
              <b>Directions of Usage (General):</b> ${d.administration || '—'}
            </div>

            <div style="font-size:12px;color:var(--text);background:var(--accent-dim);padding:8px 10px;border-radius:6px;border:1px solid rgba(59,130,246,0.1)">
              <b>🎯 Specific Category Dose:</b> <strong style="color:var(--accent)">${dose || 'Refer to doctor / pharmacist'}</strong>
            </div>
          </div>
          
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;font-size:11px;color:var(--muted);border-top:1px solid #1e2d4222;padding-top:8px">
            <span style="color:var(--accent);cursor:pointer;font-weight:700" onclick="showEditDrug(${d.id})">✏️ Edit Details</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      ${segmentButtons}
      ${unclassifiedCount > 0 ? `
        <div class="alert-strip info" style="margin-bottom: 14px; font-size: 11px; padding: 8px 12px;">
          ℹ️ Some medicines are missing detailed age suitability data. Click "Enrich Inventory with AI" above to enrich your stock.
        </div>
      ` : ''}
      <div style="display:flex;flex-direction:column;gap:12px">
        ${cardsHtml}
      </div>
    `;
  }

  // Polling for AI enrichment
  window.runEnrichmentAction = async (force) => {
    closeModal();
    const btn = document.getElementById('enrich-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enriching...'; }
    try {
      const res = await POST('/drugs/enrich_inventory?force=' + force);
      if (res.ok) {
        toast('AI Enrichment started in background', 'success');
        startEnrichmentPolling();
      } else {
        toast(res.message || 'Failed to start enrichment', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🪄 Enrich Inventory'; }
      }
    } catch(e) {
      toast('Error: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🪄 Enrich Inventory'; }
    }
  };

  window.triggerEnrichment = () => {
    modal(
      '🪄 AI Inventory Enrichment',
      `<div class="gap-12" style="font-size:14px; line-height:1.5; color:var(--text)">
        <p>Enriching your inventory updates clinical details, indications, age suitability, and side effects using AI.</p>
        <p style="color:var(--muted); font-size:12px; margin-top:8px"><strong>Missing Items Only</strong> will skip items that already have AI details.<br><strong>Re-Enrich All Items</strong> will force updates on all medicines.</p>
      </div>`,
      `<div style="display:flex; gap:8px; justify-content:flex-end; width:100%">
        <button class="btn btn-outline btn-sm" onclick="closeModal()">Cancel</button>
        <button class="btn btn-outline btn-sm" onclick="window.runEnrichmentAction(false)" style="color:var(--accent); border-color:var(--accent)">Missing Items Only</button>
        <button class="btn btn-primary btn-sm" onclick="window.runEnrichmentAction(true)">Re-Enrich All Items</button>
      </div>`
    );
  };

  function startEnrichmentPolling() {
    if (window.enrichmentInterval) clearInterval(window.enrichmentInterval);
    const statusArea = document.getElementById('enrichment-status-area');
    if (statusArea) statusArea.style.display = 'block';
    
    const btn = document.getElementById('enrich-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enriching...'; }

    window.enrichmentInterval = setInterval(async () => {
      try {
        const status = await GET('/drugs/enrich_status');
        const progressPct = status.total > 0 ? Math.round((status.current / status.total) * 100) : 0;
        const progBar = document.getElementById('enrichment-progress-bar');
        const progText = document.getElementById('enrichment-progress-text');
        
        if (progBar) progBar.style.width = progressPct + '%';
        if (progText) progText.textContent = `Progress: ${status.current} / ${status.total} medicines enriched (${progressPct}%)`;
        
        if (!status.running) {
          clearInterval(window.enrichmentInterval);
          window.enrichmentInterval = null;
          toast('✅ AI Enrichment completed successfully!', 'success');
          
          const btn = document.getElementById('enrich-btn');
          if (btn) { btn.disabled = false; btn.textContent = '🪄 Enrich Inventory'; }

          setTimeout(() => {
            const statusAreaNew = document.getElementById('enrichment-status-area');
            if (statusAreaNew) statusAreaNew.style.display = 'none';
          }, 3000);
          
          drugs = await GET('/inventory');
          if (activeTab === 'stock') {
            document.getElementById('inv-tab-content').innerHTML = renderTabContent();
          } else if (problemQuery.length >= 2) {
            window.probSearch(problemQuery);
          }
        }
      } catch(e) {
        clearInterval(window.enrichmentInterval);
        window.enrichmentInterval = null;
        const btn = document.getElementById('enrich-btn');
        if (btn) { btn.disabled = false; btn.textContent = '🪄 Enrich Inventory'; }
      }
    }, 1500);
  }

  function invRow(d) {
    const { full, broken } = breakdown(d);
    const low = (d.stock_tablets || 0) < (d.reorder_level || APP.config.low_stock_alert_limit || 20);
    const exp = d.nearest_expiry;
    const ml  = monthsLeft(exp);
    const isChecked = selectedDrugIds.has(d.id);
    return `<tr>
      <td style="text-align:center;"><input type="checkbox" class="inv-checkbox" data-id="${d.id}" ${isChecked ? 'checked' : ''} onchange="window.onInvCheckboxChange(this)"></td>
      <td><div style="font-weight:700;color:var(--text)">${d.name}</div>
          <div style="font-size:11px;color:var(--muted)">${d.brand || ''}</div>
          ${d.composition ? `<div style="font-size:11px;color:var(--text);margin-top:2px">${d.composition.length > 55 ? d.composition.substring(0,55)+'...' : d.composition}</div>` : ''}</td>
      <td style="font-size:12px;color:var(--muted)">${d.category || '—'}</td>
      <td style="font-size:12px"><button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:10px" onclick="locateDrug(${d.id})">📍 Locate</button></td>
      <td><div style="font-weight:800;color:${low ? 'var(--danger)' : 'var(--accent)'};font-size:15px">${d.stock_tablets || 0}</div>
          <div style="font-size:10px;color:var(--muted)">${full} ${(d.pack_type || 'Strip').toLowerCase()}s${broken > 0 ? '+' + broken + ' loose' : ''}</div></td>
      <td style="color:${expiryColor(exp)};font-size:12px;font-weight:${ml <= 3 ? 700 : 400}">${fmtExp(exp) || '—'}</td>
      <td style="font-weight:700">${fmt(d.mrp_per_tablet || 0)} <span style="font-size:9px;color:var(--muted)">/item</span></td>
      <td>${low ? tag('Low Stock', 'tag-red') : ml <= 0 ? tag('Expired', 'tag-red') : ml <= 3 ? tag('Exp Soon', 'tag-amber') : tag('OK', 'tag-green')}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="showEditDrug(${d.id})">✏️ Edit</button>
        ${d.nearest_expiry && ml <= 6 ? `<button class="btn btn-outline btn-sm" style="margin-top:4px;color:var(--warn);border-color:var(--warn)44" onclick="showExpiryReturn(${d.id},'${d.name}')">↩ Return</button>` : ''}
      </td>
    </tr>`;
  }

  c.innerHTML = html();

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

  window.onInvCheckboxChange = (cb) => {
    if (cb) {
      const id = parseInt(cb.getAttribute('data-id'));
      if (cb.checked) {
        selectedDrugIds.add(id);
      } else {
        selectedDrugIds.delete(id);
      }
    }
    window.updateInvSelection();
  };

  window.toggleAllInvCheckbox = (checked) => {
    const visibleDrugs = filteredDrugs();
    if (checked) {
      visibleDrugs.forEach(d => selectedDrugIds.add(d.id));
    } else {
      visibleDrugs.forEach(d => selectedDrugIds.delete(d.id));
    }
    const checkboxes = document.querySelectorAll('.inv-checkbox');
    checkboxes.forEach(cb => {
      const id = parseInt(cb.getAttribute('data-id'));
      cb.checked = selectedDrugIds.has(id);
    });
    window.updateInvSelection();
  };

  window.updateInvSelection = () => {
    const bar = document.getElementById('inv-bulk-bar');
    const countEl = document.getElementById('bulk-selected-count');
    const selectAllCheck = document.getElementById('inv-select-all');

    if (countEl) countEl.textContent = selectedDrugIds.size;
    if (bar) {
      if (selectedDrugIds.size > 0) {
        bar.style.display = 'flex';
      } else {
        bar.style.display = 'none';
      }
    }
    if (selectAllCheck) {
      const visibleDrugs = filteredDrugs();
      const visibleCheckedCount = visibleDrugs.filter(d => selectedDrugIds.has(d.id)).length;
      selectAllCheck.checked = visibleDrugs.length > 0 && visibleCheckedCount === visibleDrugs.length;
    }
  };

  window.applyBulkCategoryMove = async () => {
    const checkedIds = Array.from(selectedDrugIds);
    if (checkedIds.length === 0) {
      toast('Please select at least one item', 'warn');
      return;
    }

    const category = document.getElementById('bulk-cat-select')?.value;
    if (!category) {
      toast('Please select a target category', 'warn');
      return;
    }

    const conf = confirm(`Are you sure you want to move ${checkedIds.length} items to category "${category}"?`);
    if (!conf) return;

    try {
      await POST('/drugs/bulk_category', { drug_ids: checkedIds, category: category });
      toast(`Successfully moved ${checkedIds.length} items to ${category} ✅`, 'success');
      
      selectedDrugIds.clear();
      window.updateInvSelection();
      
      const refreshData = await GET('/inventory');
      drugs = refreshData;
      
      document.getElementById('inv-tab-content').innerHTML = renderTabContent();
    } catch (e) {
      toast('Bulk update failed: ' + e.message, 'error');
    }
  };

  window.invFilter = (v) => { filter = v; document.getElementById('inv-tab-content').innerHTML = renderTabContent(); };
 
  window.setInventoryCategory = (cat) => {
    activeCategoryFilter = cat;
    document.getElementById('inv-tab-content').innerHTML = renderTabContent();
  };

  window.setInventoryTab = (tab) => {
    activeTab = tab;
    c.innerHTML = html();
    if (tab === 'problem') {
      document.getElementById('prob-search-input')?.focus();
    }
  };

  let probTimer = null;
  window.probSearch = async (q) => {
    problemQuery = q.trim();
    if (problemQuery.length < 2) {
      problemResults = [];
      document.getElementById('problem-results-area').innerHTML = renderProblemResults();
      return;
    }
    
    clearTimeout(probTimer);
    probTimer = setTimeout(async () => {
      try {
        const area = document.getElementById('problem-results-area');
        if (area) {
          area.innerHTML = '<div style="display:flex;justify-content:center;padding:24px"><div class="spinner"></div></div>';
        }
        problemResults = await GET('/drugs/search_by_problem?q=' + encodeURIComponent(problemQuery));
        if (area) {
          area.innerHTML = renderProblemResults();
        }
      } catch (e) {
        toast('Search failed: ' + e.message, 'error');
      }
    }, 250);
  };

  window.showAddDrug = (prefill = {}) => {
    modal('➕ Add New Drug', `
      <div class="field" style="position:relative">
        <label>Search Master Database (250k+ Drugs)</label>
        <div class="search-wrap" style="margin-bottom:8px">
          <input class="input" id="ad-master-search" placeholder="Type 3+ letters to search (e.g. Augmentin)" oninput="searchMaster(this.value)" value="${prefill.name || ''}">
          <button class="btn btn-outline btn-sm" style="position:absolute;right:8px;top:32px;padding:4px 8px;font-size:11px" onclick="searchCloudDirect()">🌐 Cloud Sync</button>
          <div id="ad-master-results" class="card" style="position:absolute;top:100%;left:0;right:0;z-index:999;display:none;max-height:200px;overflow-y:auto;box-shadow:var(--shadow-lg)"></div>
        </div>
      </div>
      <div id="cloud-status" style="font-size:11px;color:var(--muted);margin-bottom:8px"></div>
      <div class="grid-2">
        <div class="field"><label>Drug Name *</label><input class="input" id="ad-name" placeholder="Name" value="${prefill.name || ''}"></div>
        <div class="field"><label>Brand / Manufacturer</label><input class="input" id="ad-brand" placeholder="Brand" value="${prefill.brand || ''}"></div>
      </div>
      <div class="field"><label>Composition</label><input class="input" id="ad-comp" placeholder="Composition" value="${prefill.composition || ''}"></div>
      <div class="grid-2">
        <div class="field"><label>Category</label>
          <select class="select" id="ad-cat">
            <option value="Ethical" ${(prefill.category || 'Ethical') === 'Ethical' ? 'selected' : ''}>Ethical</option>
            <option value="Generic" ${prefill.category === 'Generic' ? 'selected' : ''}>Generic</option>
            <option value="Ointment" ${prefill.category === 'Ointment' ? 'selected' : ''}>Ointment</option>
            <option value="Cream" ${prefill.category === 'Cream' ? 'selected' : ''}>Cream</option>
          </select>
        </div>
        <div class="field"><label>HSN Code</label>
          <input class="input" id="ad-hsn" value="${prefill.hsn || '30049099'}" list="hsn-codes">
          <datalist id="hsn-codes">
            <option value="30049099">Allopathy (Branded/Generic)</option>
            <option value="30043110">Insulin</option>
            <option value="30022011">Vaccines</option>
            <option value="30049011">Ayurvedic / Homeopathic</option>
            <option value="21069099">Food Supplements / Vitamins</option>
            <option value="90189099">Surgical / Medical Devices</option>
          </datalist>
        </div>
      </div>
      <div style="background:var(--accent-dim);padding:16px;border-radius:12px;margin:12px 0;border:1px dashed var(--accent)">
        <div style="font-weight:800;font-size:12px;color:var(--accent);margin-bottom:12px;display:flex;align-items:center;gap:6px">📦 INITIAL STOCK ENTRY</div>
        <div class="grid-2">
          <div class="field"><label>Batch Number</label><input class="input" id="ad-batch" placeholder="e.g. BT1234" value="${prefill.batch || ''}"></div>
          <div class="field"><label>Expiry Date *</label><input class="input" type="month" id="ad-expiry" value="${prefill.expiry || ''}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Initial Qty (Strips)</label><input class="input" type="number" id="ad-qty" value="${prefill.qty !== undefined ? prefill.qty : 1}"></div>
          <div class="field"><label>MRP / Strip (₹)</label><input class="input" type="number" id="ad-mrps" value="${prefill.mrps || 0}" step="0.5"></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Packaging Type</label>
          <select class="select" id="ad-pack">
            <option value="Strip" ${prefill.pack_type === 'Strip' ? 'selected' : ''}>Strip</option>
            <option value="Bottle" ${prefill.pack_type === 'Bottle' ? 'selected' : ''}>Bottle</option>
            <option value="Tube" ${prefill.pack_type === 'Tube' ? 'selected' : ''}>Tube</option>
            <option value="Piece" ${prefill.pack_type === 'Piece' ? 'selected' : ''}>Piece</option>
            <option value="Box" ${prefill.pack_type === 'Box' ? 'selected' : ''}>Box</option>
          </select>
        </div>
        <div class="field"><label>Items / Pack</label><input class="input" type="number" id="ad-tps" value="${prefill.tps || 10}"></div>
      </div>
      <div class="field"><label>Schedule</label>
        <select class="select" id="ad-sched"><option value="OTC">OTC</option><option value="Rx">Rx</option><option value="H">H</option></select>
      </div>
      <div class="field"><label>What it can be given for (Indications / Symptoms)</label><input class="input" id="ad-indications" placeholder="e.g. fever, headache, body pain"></div>
      <div class="field"><label>Side Effects</label><input class="input" id="ad-side-effects" placeholder="e.g. nausea, drowsiness, dizziness"></div>
      <div class="field"><label>How it should be administered / consumed</label><input class="input" id="ad-administration" placeholder="e.g. Take with food, twice daily after meals"></div>
      <div style="margin-top:12px; padding: 10px; background:var(--faint); border-radius: 8px; border: 1px solid var(--border)">
        <div style="font-weight:700; color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px">Age suitability guidelines</div>
        <div style="display:flex; gap:16px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; color:var(--text)">
            <input type="checkbox" id="ad-child-ok" style="width:16px;height:16px;accent-color:var(--accent)"> Children
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; color:var(--text)">
            <input type="checkbox" id="ad-adult-ok" checked style="width:16px;height:16px;accent-color:var(--accent)"> Adults
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; color:var(--text)">
            <input type="checkbox" id="ad-elderly-ok" checked style="width:16px;height:16px;accent-color:var(--accent)"> Seniors / Elderly
          </label>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:8px">
        <input type="checkbox" id="ad-auto-enrich" checked style="width:16px;height:16px;accent-color:var(--accent)">
        <label for="ad-auto-enrich" style="cursor:pointer;font-weight:700;font-size:13px;color:var(--accent)">✨ Auto-fill composition & clinical details with AI after saving</label>
      </div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="saveDrug()">Add Drug</button>`
    );
  };

  window.searchCloudDirect = async () => {
    const q = document.getElementById('ad-master-search').value;
    if (q.length < 3) { toast('Type a medicine name first', 'warn'); return; }
    const status = document.getElementById('cloud-status');
    status.innerHTML = '⏳ Searching live on Cloud (1mg/Netmeds)...';
    
    const results = await GET('/cloud/search?q=' + encodeURIComponent(q));
    if (!results || !results.length) {
      status.innerHTML = '❌ Not found in live cloud. Use Master DB.';
      return;
    }
    
    status.innerHTML = `✅ Found ${results.length} cloud matches.`;
    const resDiv = document.getElementById('ad-master-results');
    resDiv.innerHTML = results.map(d => `
      <div class="list-item" style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);background:#f0f7ff" onclick='selectCloudDrug(${JSON.stringify(d).replace(/'/g, "&apos;")})'>
        <div style="display:flex;gap:10px;align-items:center">
          ${d.image_url ? `<img src="${d.image_url}" style="width:40px;height:40px;object-fit:contain;border-radius:4px">` : '💊'}
          <div style="flex:1">
            <div style="font-weight:800;font-size:13px;color:var(--accent)">${d.name}</div>
            <div style="font-size:10px;color:var(--muted)">${d.manufacturer} · Live MRP: ₹${d.mrp}</div>
          </div>
          <div style="font-size:18px">☁️</div>
        </div>
      </div>
    `).join('');
    resDiv.style.display = 'block';
  };

  window.selectCloudDrug = async (d) => {
    document.getElementById('ad-name').value = d.name;
    document.getElementById('ad-brand').value = d.manufacturer;
    document.getElementById('ad-mrps').value = d.mrp || 0;
    document.getElementById('ad-master-results').style.display = 'none';
    
    const status = document.getElementById('cloud-status');
    status.innerHTML = '⌛ Fetching composition and side effects...';
    
    try {
      const details = await GET('/cloud/details?url=' + encodeURIComponent(d.detail_url));
      document.getElementById('ad-comp').value = details.composition || '';
      status.innerHTML = '✅ Cloud Data Synced Successfully!';
      toast('Synced from Live Cloud!', 'success');
    } catch(e) {
      status.innerHTML = '⚠️ Basic details synced. Composition failed.';
    }
  };

  window.searchMaster = async (q) => {
    const resDiv = document.getElementById('ad-master-results');
    if (q.length < 3) { resDiv.style.display = 'none'; return; }
    const results = await GET('/drugs/master_search?q=' + encodeURIComponent(q));
    if (!results.length) { resDiv.style.display = 'none'; return; }
    
    resDiv.innerHTML = results.map(d => `
      <div class="list-item" style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border)" onclick='selectMasterDrug(${JSON.stringify(d).replace(/'/g, "&apos;")})'>
        <div style="font-weight:700;font-size:13px">${d.name}</div>
        <div style="font-size:10px;color:var(--muted)">${d.manufacturer} | ${d.composition.substring(0, 50)}...</div>
      </div>
    `).join('');
    resDiv.style.display = 'block';
  };

  window.selectMasterDrug = (d) => {
    document.getElementById('ad-name').value = d.name;
    document.getElementById('ad-brand').value = d.manufacturer;
    document.getElementById('ad-comp').value = d.composition;
    document.getElementById('ad-mrps').value = d.mrp || 0;
    if (d.hsn) document.getElementById('ad-hsn').value = d.hsn;
    document.getElementById('ad-master-results').style.display = 'none';
    document.getElementById('ad-master-search').value = d.name;
    toast('Auto-filled drug details!', 'info');
  };

  window.saveDrug = async () => {
    const name = document.getElementById('ad-name')?.value?.trim();
    if (!name) { toast('Drug name required', 'warn'); return; }
    const tps  = parseInt(document.getElementById('ad-tps')?.value || 10);
    const mrps = parseFloat(document.getElementById('ad-mrps')?.value || 0);
    const mrpt = parseFloat(document.getElementById('ad-mrpt')?.value || 0) || (mrps / tps);
    const batch = document.getElementById('ad-batch')?.value?.trim();
    const expiry = document.getElementById('ad-expiry')?.value;
    const qty = parseInt(document.getElementById('ad-qty')?.value || 0);

    if (qty > 0 && !expiry) {
        toast('Expiry Date is mandatory for initial stock!', 'warn');
        return;
    }
    // If user entered a batch but no expiry
    if (batch && !expiry) {
        toast('Expiry Date is mandatory!', 'warn');
        return;
    }

    const indications = document.getElementById('ad-indications')?.value?.trim() || '';
    const side_effects = document.getElementById('ad-side-effects')?.value?.trim() || '';
    const administration = document.getElementById('ad-administration')?.value?.trim() || '';

    const childOk = document.getElementById('ad-child-ok')?.checked || false;
    const adultOk = document.getElementById('ad-adult-ok')?.checked || false;
    const elderlyOk = document.getElementById('ad-elderly-ok')?.checked || false;

    const suitabilityObj = {
      child: { ok: childOk, dose: childOk ? (indications ? `Pediatric dosage for ${indications}` : "Pediatric dose") : "Not recommended" },
      adult: { ok: adultOk, dose: adultOk ? (administration || "Standard adult dose") : "" },
      elderly: { ok: elderlyOk, dose: elderlyOk ? (administration || "Standard elderly dose") : "" }
    };

    const res = await POST('/drugs', {
      name, brand: document.getElementById('ad-brand')?.value || '',
      composition: document.getElementById('ad-comp')?.value || '',
      category: document.getElementById('ad-cat')?.value || '',
      schedule: document.getElementById('ad-sched')?.value || 'OTC',
      hsn: document.getElementById('ad-hsn')?.value || '30049099',
      tablets_per_strip: tps, strips_per_box: 10,
      mrp_per_strip: mrps, mrp_per_tablet: mrpt,
      reorder_level: parseInt(document.getElementById('ad-reorder')?.value || APP.config.low_stock_alert_limit || 20),
      pack_type: document.getElementById('ad-pack')?.value || 'Strip',
      batch_no: batch || null,
      expiry: expiry || null,
      initial_strips: qty,
      indications,
      side_effects,
      administration,
      age_suitability: JSON.stringify(suitabilityObj)
    });

    const newDrug = {
      id: res.id,
      name,
      brand: document.getElementById('ad-brand')?.value || '',
      composition: document.getElementById('ad-comp')?.value || '',
      category: document.getElementById('ad-cat')?.value || '',
      mrp_per_strip: mrps,
      pack_type: document.getElementById('ad-pack')?.value || 'Strip',
    };

    closeModal();
    toast('Drug added ✅', 'success');

    // Background AI enrichment if checkbox is ticked
    const autoEnrich = document.getElementById('ad-auto-enrich')?.checked;
    if (autoEnrich && res.id) {
      toast('✨ AI enriching details in background…', 'info');
      const drugName = name;
      const drugBrand = document.getElementById('ad-brand')?.value || '';
      const drugComp  = document.getElementById('ad-comp')?.value || '';
      // Fire-and-forget — don't await so the UI stays instant
      POST('/drugs/enrich_single', { drug_id: res.id, name: drugName, brand: drugBrand, composition: drugComp })
        .then(enriched => {
          if (enriched && enriched.ok) {
            toast('✅ AI enrichment complete for ' + drugName, 'success');
            // Patch the local list so the detail view reflects the new data without a full reload
            const idx = drugs.findIndex(d => d.id === res.id);
            if (idx !== -1) Object.assign(drugs[idx], enriched.data || {});
          }
        })
        .catch(() => { /* silent fail — user can enrich later */ });
    }

    if (window._onDrugAdded) {
      window._onDrugAdded(newDrug);
      window._onDrugAdded = null;
    } else {
      drugs = await GET('/inventory');
      c.innerHTML = html();
    }
  };

  window.showEditDrug = async (id) => {
    const [d, layout] = await Promise.all([GET('/drugs/' + id), GET('/layout').catch(() => [])]);

    // Build location dropdown options
    let boxOptions = `<option value="">— No location assigned —</option>`;
    layout.forEach(fixture => {
      (fixture.compartments || []).forEach(comp => {
        (comp.boxes || []).forEach(box => {
          const selected = box.id === d.box_id ? 'selected' : '';
          const path = `${fixture.name} › ${comp.name} › ${box.name}`;
          boxOptions += `<option value="${box.id}" ${selected}>${path}</option>`;
        });
      });
    });

    let childChecked = '';
    let adultChecked = 'checked';
    let elderlyChecked = 'checked';

    if (d.age_suitability) {
      try {
        const suitability = JSON.parse(d.age_suitability);
        childChecked = suitability.child?.ok ? 'checked' : '';
        adultChecked = suitability.adult?.ok ? 'checked' : '';
        elderlyChecked = suitability.elderly?.ok ? 'checked' : '';
      } catch (e) {
        console.error("Failed to parse age suitability in edit modal:", e);
      }
    }

    modal('✏️ Edit Drug', `
      <div class="grid-2">
        <div class="field"><label>Drug Name</label><input class="input" id="ed-name" value="${d.name}"></div>
        <div class="field"><label>Brand</label><input class="input" id="ed-brand" value="${d.brand || ''}"></div>
      </div>
      <div class="field"><label>Composition</label><input class="input" id="ed-comp" value="${d.composition || ''}"></div>
      <div class="grid-2">
        <div class="field"><label>Category</label><input class="input" id="ed-cat" value="${d.category || ''}"></div>
        <div class="field">
          <label>📦 Location (Box)</label>
          <select class="select" id="ed-box" style="font-size:12px">
            ${boxOptions}
          </select>
          ${d.box_id ? `<div style="font-size:10px;color:var(--accent);margin-top:4px">Currently assigned to a box</div>` : `<div style="font-size:10px;color:var(--muted);margin-top:4px">No location set yet</div>`}
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>HSN Code</label>
          <input class="input" id="ed-hsn" value="${d.hsn || '30049099'}" list="hsn-codes">
        </div>
        <div class="field"><label>Reorder Level (tabs)</label><input class="input" type="number" id="ed-reorder" value="${d.reorder_level || APP.config.low_stock_alert_limit || 20}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>MRP / Pack (₹)</label><input class="input" type="number" id="ed-mrps" value="${d.mrp_per_strip || 0}" step="0.5"></div>
        <div class="field"><label>Packaging Type</label>
          <select class="select" id="ed-pack">
            <option value="Strip" ${d.pack_type === 'Strip' ? 'selected' : ''}>Strip</option>
            <option value="Bottle" ${d.pack_type === 'Bottle' ? 'selected' : ''}>Bottle</option>
            <option value="Tube" ${d.pack_type === 'Tube' ? 'selected' : ''}>Tube</option>
            <option value="Piece" ${d.pack_type === 'Piece' ? 'selected' : ''}>Piece</option>
            <option value="Box" ${d.pack_type === 'Box' ? 'selected' : ''}>Box</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>MRP / Item (₹)</label><input class="input" type="number" id="ed-mrpt" value="${d.mrp_per_tablet || 0}" step="0.01"></div>
      </div>
      <div class="field"><label>What it can be given for (Indications / Symptoms)</label><input class="input" id="ed-indications" value="${d.indications || ''}" placeholder="e.g. fever, headache, body pain"></div>
      <div class="field"><label>Side Effects</label><input class="input" id="ed-side-effects" value="${d.side_effects || ''}" placeholder="e.g. nausea, drowsiness, dizziness"></div>
      <div class="field"><label>How it should be administered / consumed</label><input class="input" id="ed-administration" value="${d.administration || ''}" placeholder="e.g. Take with food, twice daily after meals"></div>
      <div style="margin-top:12px; padding: 10px; background:var(--faint); border-radius: 8px; border: 1px solid var(--border)">
        <div style="font-weight:700; color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px">Age suitability guidelines</div>
        <div style="display:flex; gap:16px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; color:var(--text)">
            <input type="checkbox" id="ed-child-ok" ${childChecked} style="width:16px;height:16px;accent-color:var(--accent)"> Children
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; color:var(--text)">
            <input type="checkbox" id="ed-adult-ok" ${adultChecked} style="width:16px;height:16px;accent-color:var(--accent)"> Adults
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; color:var(--text)">
            <input type="checkbox" id="ed-elderly-ok" ${elderlyChecked} style="width:16px;height:16px;accent-color:var(--accent)"> Seniors / Elderly
          </label>
        </div>
      </div>
      <div style="margin-top:12px; padding: 12px; background:var(--faint); border-radius: 8px; border: 1px solid var(--border)">
        <div style="font-weight:700; color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px">📦 Active Batches & Costs</div>
        ${d.batches && d.batches.length ? d.batches.map(b => `
          <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px">
            <div style="flex:1; font-size:12px">
              <strong>Batch ${b.batch_no}</strong><br>
              <span style="color:var(--muted); font-size:10.5px">Exp ${b.expiry} · ${b.full_strips} strips remaining</span>
            </div>
            <div class="field" style="width:125px; margin-bottom:0">
              <label style="font-size:10px">Cost / Strip (₹)</label>
              <input class="input edit-batch-cost" type="number" data-id="${b.id}" value="${b.cost_per_strip || 0}" step="0.1" style="height:32px; padding:4px 8px; font-size:12px">
            </div>
          </div>
        `).join('') : '<div style="font-size:12px; color:var(--muted)">No batch stock history found</div>'}
      </div>
      `,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger)44;flex:0.5" onclick="deleteDrug(${id})">🗑️ Delete</button>
       <button class="btn btn-primary" style="flex:1" onclick="updateDrug(${id})">Save Changes</button>`
    );
  };

  window.deleteDrug = async (id) => {
    if (!confirm('Are you sure you want to completely remove this drug from your inventory?')) return;
    try {
      const token = localStorage.getItem('pp_token') || '';
      const r = await fetch('/api/drugs/' + id, { method: 'DELETE', headers: { 'x-token': token } });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.detail || e.message || 'Failed to delete');
      }
      closeModal();
      toast('Drug deleted ✅', 'success');
      drugs = await GET('/inventory');
      c.innerHTML = html();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.updateDrug = async (id) => {
    try {
      const getValue = (elId) => {
        const el = document.getElementById(elId);
        return (el && el.value !== '') ? el.value : undefined;
      };
      const getFloat = (elId) => {
        const el = document.getElementById(elId);
        return (el && el.value !== '') ? parseFloat(el.value) : undefined;
      };
      const getInt = (elId) => {
        const el = document.getElementById(elId);
        return (el && el.value !== '') ? parseInt(el.value) : undefined;
      };

      const boxEl = document.getElementById('ed-box');
      const box_id = (boxEl && boxEl.value !== '') ? parseInt(boxEl.value) : null;

      // Fetch existing drug data to preserve any specific age suitability dosage details
      const existingDrug = await GET('/drugs/' + id);
      let existingSuitability = null;
      if (existingDrug && existingDrug.age_suitability) {
        try {
          existingSuitability = JSON.parse(existingDrug.age_suitability);
        } catch (e) {}
      }

      const childOk = document.getElementById('ed-child-ok')?.checked || false;
      const adultOk = document.getElementById('ed-adult-ok')?.checked || false;
      const elderlyOk = document.getElementById('ed-elderly-ok')?.checked || false;

      const indications = getValue('ed-indications') || '';
      const administration = getValue('ed-administration') || '';

      const suitabilityObj = {
        child: {
          ok: childOk,
          dose: childOk
            ? (existingSuitability?.child?.dose || (indications ? `Pediatric dosage for ${indications}` : "Pediatric dose"))
            : "Not recommended"
        },
        adult: {
          ok: adultOk,
          dose: adultOk
            ? (existingSuitability?.adult?.dose || administration || "Standard adult dose")
            : ""
        },
        elderly: {
          ok: elderlyOk,
          dose: elderlyOk
            ? (existingSuitability?.elderly?.dose || administration || "Standard elderly dose")
            : ""
        }
      };

      await PUT('/drugs/' + id, {
        name: getValue('ed-name'),
        brand: getValue('ed-brand'),
        composition: getValue('ed-comp'),
        category: getValue('ed-cat'),
        box_id: box_id,
        hsn: getValue('ed-hsn'),
        mrp_per_strip: getFloat('ed-mrps'),
        mrp_per_tablet: getFloat('ed-mrpt'),
        reorder_level: getInt('ed-reorder'),
        pack_type: getValue('ed-pack'),
        indications: getValue('ed-indications'),
        side_effects: getValue('ed-side-effects'),
        administration: getValue('ed-administration'),
        age_suitability: JSON.stringify(suitabilityObj)
      });

      // Save modified batch costs
      const batchCostElements = document.querySelectorAll('.edit-batch-cost');
      const batchUpdates = [];
      const token = localStorage.getItem('pp_token') || '';
      for (const el of batchCostElements) {
        const bId = el.dataset.id;
        const bCost = parseFloat(el.value || 0);
        batchUpdates.push(
          fetch('/api/batches/' + bId, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'x-token': token 
            },
            body: JSON.stringify({ cost_per_strip: bCost })
          })
        );
      }
      if (batchUpdates.length > 0) {
        await Promise.all(batchUpdates);
      }

      closeModal();
      toast('Drug updated ✅', 'success');
      drugs = await GET('/inventory');
      c.innerHTML = html();
    } catch (e) {
      toast('Update failed: ' + e.message, 'error');
    }
  };

  window.showExpiryReturn = async (drug_id, drug_name) => {
    const d = await GET('/drugs/' + drug_id);
    const sups = await GET('/suppliers');
    const batches = d.batches.filter(b => b.full_strips > 0);
    if (!batches.length) { toast('No stock to return', 'warn'); return; }
    modal('↩ Return Expiring Stock', `
      <div class="alert-strip warn">Returning stock will deduct it from your inventory.</div>
      <div class="field"><label>Drug</label><input class="input" value="${drug_name}" disabled></div>
      <div class="field"><label>Batch to Return</label>
        <select class="select" id="er-batch">
          ${batches.map(b => `<option value="${b.id}">Batch ${b.batch_no} · Exp ${b.expiry} · ${b.full_strips} strips</option>`).join('')}
        </select></div>
      <div class="field"><label>Strips to Return</label><input class="input" type="number" id="er-strips" value="1" min="1"></div>
      <div class="field"><label>Supplier</label>
        <select class="select" id="er-sup">
          <option value="">— Select supplier —</option>
          ${sups.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select></div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="saveExpiryReturn(${drug_id})">Confirm Return</button>`
    );
  };

  window.saveExpiryReturn = async (drug_id) => {
    const batch_id       = parseInt(document.getElementById('er-batch')?.value);
    const strips_returned = parseInt(document.getElementById('er-strips')?.value || 1);
    const supplier_id    = parseInt(document.getElementById('er-sup')?.value) || null;
    await POST('/expiry_returns', { drug_id, batch_id, supplier_id, strips_returned, reason: 'expiry' });
    closeModal();
    toast('Expiry return logged ✅', 'success');
    drugs = await GET('/inventory');
    c.innerHTML = html();
  };

  window.showExpiringManager = async () => {
    const expiredList = await GET('/expired');
    modal('Expiring / Expired Stock', `
      <div class="alert-strip warn" style="margin-bottom:16px">These batches expire within 3 months or have already expired. You should return them to the supplier for credit.</div>
      <div style="max-height:60vh;overflow-y:auto;padding-right:4px">
        ${expiredList.length === 0 ? '<div style="text-align:center;color:var(--muted);padding:24px">No expiring stock right now.</div>' : ''}
        ${expiredList.map(b => `
          <div class="card" style="margin-bottom:8px;padding:12px;border:1px solid ${b.expiry < new Date().toISOString().slice(0,10) ? 'var(--danger)' : 'var(--warn)'}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:800;color:var(--text)">${b.drug_name} <span style="font-weight:400;color:var(--muted);font-size:11px">${b.brand || ''}</span></div>
                <div style="font-size:11px">Batch: <span style="font-family:monospace;font-weight:700">${b.batch_no}</span> · Exp: <b style="color:var(--danger)">${b.expiry}</b></div>
              </div>
              <div style="text-align:right">
                <div style="font-size:11px;color:var(--muted)">Stock Available:</div>
                <div style="font-weight:800;font-size:14px;color:var(--accent)">${b.full_strips} strips</div>
              </div>
            </div>
            <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);display:flex;gap:8px">
              <input type="number" id="ret-qty-${b.id}" class="input" value="${b.full_strips}" style="width:80px;font-size:12px" min="1" max="${b.full_strips}">
              <select class="select" id="ret-sup-${b.id}" style="flex:1;font-size:12px"></select>
              <button class="btn btn-outline" style="color:var(--warn);border-color:var(--warn)44;font-size:11px" onclick="execBatchReturn(${b.drug_id}, ${b.id})">Return to Supplier</button>
            </div>
          </div>
        `).join('')}
      </div>
    `);

    if (expiredList.length > 0) {
      const sups = await GET('/suppliers');
      const suppOptions = `<option value="">— Select Supplier —</option>` + sups.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      expiredList.forEach(b => {
        const sel = document.getElementById('ret-sup-' + b.id);
        if (sel) {
          sel.innerHTML = suppOptions;
          if (b.default_supplier) sel.value = b.default_supplier;
        }
      });
    }
  };

  window.execBatchReturn = async (drug_id, batch_id) => {
    const btn = event.currentTarget;
    btn.disabled = true; btn.textContent = 'Processing...';
    
    const strips = parseInt(document.getElementById('ret-qty-' + batch_id)?.value);
    const sup_id = parseInt(document.getElementById('ret-sup-' + batch_id)?.value);
    
    if (!strips || strips <= 0) { toast('Invalid quantity', 'warn'); btn.disabled = false; return; }
    if (!sup_id) { toast('Please select supplier', 'warn'); btn.disabled = false; return; }

    try {
      await POST('/expiry_returns', { drug_id, batch_id, supplier_id: sup_id, strips_returned: strips, reason: 'expiry' });
      toast('Returned successfully', 'success');
      
      // refresh lists
      drugs = await GET('/inventory');
      c.innerHTML = html();
      showExpiringManager();
    } catch(e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = 'Return to Supplier';
    }
  };

  // On page load/render, check if AI enrichment is already running in the background, if so, resume polling
  setTimeout(async () => {
    try {
      const status = await GET('/drugs/enrich_status');
      if (status && status.running) {
        startEnrichmentPolling();
      }
    } catch(e) {
      console.error('Error fetching enrichment status on render:', e);
    }
  }, 100);
}
