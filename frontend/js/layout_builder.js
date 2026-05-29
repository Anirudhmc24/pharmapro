import { GET, POST } from './api.js';
import { toast, modal, closeModal } from './utils.js';

export async function renderLayoutBuilder(c, APP) {
  let layout = [];
  try {
    layout = await GET('/layout');
  } catch(e) {
    console.error(e);
  }

  // State
  let dragging = null;
  let activeFixture = null;
  let dragOffset = { x: 0, y: 0 };
  let canvasRect = null;
  
  function renderSidebar() {
    if(!activeFixture) {
      return `
        <div class="gap-16">
          <div class="section-title">Add Fixture</div>
          <div class="grid-2">
            <button class="btn btn-outline draggable-source" data-type="rack">Wall Rack</button>
            <button class="btn btn-outline draggable-source" data-type="counter">Counter</button>
            <button class="btn btn-outline draggable-source" data-type="fridge">Fridge</button>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:10px">
            Tip: Drag items onto the canvas. Or click an existing item to edit its compartments.
          </div>
          <button class="btn btn-primary" style="margin-top:20px" id="lb-save">Save Layout</button>
        </div>
      `;
    }
    
    // Active Fixture Editor
    let compsHtml = '';
    const comps = activeFixture.compartments || [];
    comps.forEach((comp, i) => {
      let boxesHtml = '';
      const boxes = comp.boxes || [];
      boxes.forEach((box, j) => {
        boxesHtml += `<div style="display:inline-flex;align-items:center;gap:4px;margin:2px">
          <input class="input box-name-edit" style="width:90px;padding:3px 6px;font-size:11px;font-weight:700;color:var(--accent);background:var(--accent-dim);border-color:var(--accent)33" 
            value="${box.name}" data-cid="${i}" data-bid="${j}" placeholder="Box name">
          <button class="btn btn-sm rm-box" data-cid="${i}" data-bid="${j}" style="padding:2px 6px;font-size:10px;color:var(--danger);border-color:var(--danger)33">✕</button>
        </div>`;
      });
      compsHtml += `
        <div class="card-sm" style="margin-bottom:8px">
          <div class="flex-between" style="margin-bottom:8px">
            <input class="input" style="padding:4px 8px;font-size:12px;width:120px" value="${comp.name}" data-cid="${i}" class="comp-name-edit">
            <button class="btn btn-sm btn-outline rm-comp" data-cid="${i}">✖</button>
          </div>
          <div style="font-size:10px;margin-bottom:6px;display:flex;flex-wrap:wrap;gap:2px">${boxesHtml || '<span style="color:var(--muted);font-size:10px">No boxes yet</span>'}</div>
          <button class="btn btn-sm btn-outline add-box" data-cid="${i}">+ Add Box</button>
        </div>
      `;
    });

    return `
      <div class="gap-12">
        <div class="flex-between">
          <div class="section-title" style="margin:0">Edit Fixture</div>
          <button class="btn btn-sm" id="lb-deselect">Done</button>
        </div>
        <div class="field">
          <label>Name</label>
          <input class="input" id="fix-name" value="${activeFixture.name}">
        </div>
        <div class="grid-2">
          <div class="field">
            <label>Width</label>
            <input type="number" class="input" id="fix-w" value="${activeFixture.width || 100}">
          </div>
          <div class="field">
            <label>Height</label>
            <input type="number" class="input" id="fix-h" value="${activeFixture.height || 100}">
          </div>
        </div>
        <div class="field" style="margin-bottom:10px">
          <label>Color</label>
          <input type="color" style="width:100%;height:30px;border:none;border-radius:4px" id="fix-color" value="${activeFixture.color || '#fff'}">
        </div>
        
        <div class="section-title">Compartments</div>
        ${compsHtml}
        <button class="btn btn-sm btn-outline" id="lb-add-comp" style="width:100%;justify-content:center">+ Add Shelf/Drawer</button>
        
        <button class="btn btn-danger btn-sm" id="lb-rm-fix" style="margin-top:20px;width:100%;justify-content:center">Delete Fixture</button>
      </div>    
    `;
  }

  function html() {
    return `
      <style>
        .lb-canvas {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          height: calc(100vh - 120px);
          position: relative;
          overflow: hidden;
          background-image: 
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 20px 20px;
        }
        .lb-sidebar {
          width: 300px;
          background: var(--card);
          border-left: 1px solid var(--border);
          padding: 24px;
          height: calc(100vh - 120px);
          overflow-y: auto;
        }
        .fixture-node {
          position: absolute;
          border: 2px solid transparent;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 11px;
          cursor: grab;
          user-select: none;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          text-align: center;
          padding: 4px;
          line-height: 1.2;
        }
        .fixture-node.active {
          border-color: #fff;
          box-shadow: 0 0 0 3px var(--accent-glow);
        }
        .fixture-node:active { cursor: grabbing; }
        .draggable-source { cursor: grab; }
      </style>
      <div style="display:flex;height:100%;min-height:100%">
        <div style="flex:1;padding:24px">
          <div class="flex-between" style="margin-bottom:16px">
             <div>
               <h2 style="font-size:20px;font-weight:800">Store Layout Builder</h2>
               <div style="color:var(--muted);font-size:12px;margin-top:2px">Drag fixtures into the grid and map your shelves & boxes.</div>
             </div>
          </div>
          <div class="lb-canvas" id="canvas">
             <!-- Fixtures render here -->
          </div>
        </div>
        <div class="lb-sidebar" id="sidebar-pane">
           ${renderSidebar()}
        </div>
      </div>
    `;
  }

  c.innerHTML = html();
  const canvas = document.getElementById('canvas');
  const sidebarPane = document.getElementById('sidebar-pane');

  function drawCanvas() {
    canvas.innerHTML = '';
    layout.forEach((f, i) => {
      const el = document.createElement('div');
      el.className = 'fixture-node';
      if(activeFixture === f) el.classList.add('active');
      el.style.left = (f.x_pos || 0) + 'px';
      el.style.top = (f.y_pos || 0) + 'px';
      el.style.width = (f.width || 100) + 'px';
      el.style.height = (f.height || 100) + 'px';
      if (f.color) el.style.backgroundColor = f.color + 'aa';
      if (f.color) el.style.borderLeft = '4px solid ' + f.color;
      el.innerHTML = f.name;
      
      el.addEventListener('mousedown', (e) => {
        if(e.target !== el) return;
        activeFixture = f;
        dragging = f;
        canvasRect = canvas.getBoundingClientRect();
        dragOffset.x = e.clientX - canvasRect.left - (f.x_pos || 0);
        dragOffset.y = e.clientY - canvasRect.top - (f.y_pos || 0);
        updateUI();
      });
      canvas.appendChild(el);
    });
  }

  function updateUI() {
    drawCanvas();
    sidebarPane.innerHTML = renderSidebar();
    attachSidebarEvents();
  }

  function attachSidebarEvents() {
    // Draggables
    const sources = document.querySelectorAll('.draggable-source');
    sources.forEach(src => {
      src.addEventListener('mousedown', (e) => {
        const type = src.getAttribute('data-type');
        const color = type==='fridge'? '#06b6d4' : type==='counter'? '#f59e0b' : '#3b82f6';
        const newFix = {
          name: 'New ' + type, type: type, x_pos: 20, y_pos: 20, width: 100, height: 100, color,
          compartments: [
            { name: "Shelf 1", type: "shelf", boxes: [{name: "Box 1"}] }
          ]
        };
        layout.push(newFix);
        activeFixture = newFix;
        dragging = newFix;
        canvasRect = canvas.getBoundingClientRect();
        dragOffset.x = 50; dragOffset.y = 50; // default center grab
        updateUI();
      });
    });

    if(activeFixture) {
      document.getElementById('lb-deselect')?.addEventListener('click', () => { activeFixture=null; updateUI() });
      document.getElementById('lb-rm-fix')?.addEventListener('click', () => { 
        layout = layout.filter(x => x !== activeFixture);
        activeFixture = null; updateUI();
      });
      
      const inName = document.getElementById('fix-name');
      const inW = document.getElementById('fix-w');
      const inH = document.getElementById('fix-h');
      const inC = document.getElementById('fix-color');
      
      const applyAttr = () => {
        activeFixture.name = inName.value;
        activeFixture.width = parseInt(inW.value)||100;
        activeFixture.height = parseInt(inH.value)||100;
        activeFixture.color = inC.value;
        drawCanvas(); // Fast update without full sidebar rebuild
      };
      
      inName?.addEventListener('input', applyAttr);
      inW?.addEventListener('input', applyAttr);
      inH?.addEventListener('input', applyAttr);
      inC?.addEventListener('input', applyAttr);

      // Compartments
      document.getElementById('lb-add-comp')?.addEventListener('click', () => {
        if(!activeFixture.compartments) activeFixture.compartments = [];
        activeFixture.compartments.push({name: "New Shelf", type: "shelf", boxes: []});
        updateUI();
      });
      document.querySelectorAll('.rm-comp').forEach(btn => btn.addEventListener('click', e => {
        const idx = parseInt(btn.getAttribute('data-cid'));
        activeFixture.compartments.splice(idx, 1);
        updateUI();
      }));
      document.querySelectorAll('.add-box').forEach(btn => btn.addEventListener('click', e => {
        const idx = parseInt(btn.getAttribute('data-cid'));
        const comp = activeFixture.compartments[idx];
        if(!comp.boxes) comp.boxes = [];
        const suggested = 'Box ' + String.fromCharCode(65 + comp.boxes.length);
        const name = prompt('Enter box name:', suggested);
        if (name === null) return; // user cancelled
        comp.boxes.push({name: name.trim() || suggested});
        updateUI();
      }));
      document.querySelectorAll('.box-name-edit').forEach(inp => inp.addEventListener('change', e => {
        const cid = parseInt(inp.getAttribute('data-cid'));
        const bid = parseInt(inp.getAttribute('data-bid'));
        activeFixture.compartments[cid].boxes[bid].name = inp.value;
      }));
      document.querySelectorAll('.rm-box').forEach(btn => btn.addEventListener('click', e => {
        const cid = parseInt(btn.getAttribute('data-cid'));
        const bid = parseInt(btn.getAttribute('data-bid'));
        activeFixture.compartments[cid].boxes.splice(bid, 1);
        updateUI();
      }));
      document.querySelectorAll('.comp-name-edit').forEach(inp => inp.addEventListener('change', e => {
        const idx = parseInt(inp.getAttribute('data-cid'));
        activeFixture.compartments[idx].name = inp.value;
      }));
    } else {
      document.getElementById('lb-save')?.addEventListener('click', async () => {
        const btn = document.getElementById('lb-save');
        btn.textContent = "Saving..."; btn.disabled = true;
        try {
          await POST('/layout', { layout_json: JSON.stringify(layout) });
          toast("Layout saved!");
        } catch(e) {
          alert('Save failed: ' + e.message);
        }
        btn.textContent = "Save Layout"; btn.disabled = false;
      });
    }
  }

  // Global mouse handlers for drag
  const onMove = (e) => {
    if(!dragging) return;
    let x = e.clientX - canvasRect.left - dragOffset.x;
    let y = e.clientY - canvasRect.top - dragOffset.y;
    // Snap to grid of 20
    x = Math.round(x / 20) * 20;
    y = Math.round(y / 20) * 20;
    x = Math.max(0, x); y = Math.max(0, y);
    dragging.x_pos = x;
    dragging.y_pos = y;
    drawCanvas();
  };
  const onUp = (e) => {
    if(dragging) { dragging = null; updateUI(); }
  };
  
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  
  // Cleanup
  c._lb_cleanup = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  updateUI();
}
