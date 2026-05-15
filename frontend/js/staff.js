// staff.js — Staff management (admin only)
import { GET, POST, PUT } from './api.js';
import { tag, toast, modal, closeModal, formatDate } from './utils.js';

export async function renderStaff(c, APP) {
  let users = await GET('/users');

  const roleTag = (r) => ({ admin: tag('Admin', 'tag-red'), pharmacist: tag('Pharmacist', 'tag-teal'), cashier: tag('Cashier', 'tag-blue') }[r] || tag(r, 'tag-gray'));

  function html() {
    return `<div class="gap-16 fade-in">
      <div class="flex-between">
        <div><h2 style="font-size:18px;font-weight:800;margin-bottom:2px">Staff Management</h2>
          <div style="color:var(--muted);font-size:12px">${users.length} staff accounts</div></div>
        <button class="btn btn-primary btn-sm" onclick="showAddStaff()">+ Add Staff</button>
      </div>
      <div class="card" style="padding:0;overflow:auto">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>${users.map(u => `<tr style="opacity:${u.active ? 1 : 0.5}">
            <td style="font-weight:700">${u.display_name}</td>
            <td style="font-family:monospace;color:var(--muted)">${u.username}</td>
            <td>${roleTag(u.role)}</td>
            <td>${u.active ? tag('Active', 'tag-green') : tag('Inactive', 'tag-gray')}</td>
            <td style="font-size:11px;color:var(--muted)">${formatDate(u.created_at)}</td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-outline btn-sm" onclick="showChangePassword(${u.id},'${u.display_name}')">🔑 Password</button>
              ${u.username !== 'admin' ? `<button class="btn btn-outline btn-sm" onclick="toggleStaff(${u.id})">${u.active ? 'Deactivate' : 'Activate'}</button>` : ''}
            </td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card-sm">
        <div class="section-title">Role Permissions</div>
        <div class="gap-12">
          ${[
            ['Admin', 'tag-red', 'Full access — billing, inventory, reports, staff, settings'],
            ['Pharmacist', 'tag-teal', 'Billing, inventory, stock entry, put-away, reports'],
            ['Cashier', 'tag-blue', 'Billing and customer management only'],
          ].map(([r, t, d]) => `<div class="flex-between"><div><span class="tag ${t}" style="margin-right:8px">${r}</span>${d}</div></div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  c.innerHTML = html();

  window.showAddStaff = () => {
    modal('👤 Add Staff Member', `
      <div class="field"><label>Full Name *</label><input class="input" id="st-name" placeholder="Display name"></div>
      <div class="field"><label>Username *</label><input class="input" id="st-uname" placeholder="Login username (no spaces)"></div>
      <div class="field"><label>Password *</label><input class="input" type="password" id="st-pwd" placeholder="Min 6 characters"></div>
      <div class="field"><label>Role</label>
        <select class="select" id="st-role">
          <option value="cashier">Cashier — billing only</option>
          <option value="pharmacist">Pharmacist — billing + inventory</option>
          <option value="admin">Admin — full access</option>
        </select></div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="saveStaff()">Add Staff</button>`
    );
  };

  window.saveStaff = async () => {
    const display_name = document.getElementById('st-name')?.value?.trim();
    const username     = document.getElementById('st-uname')?.value?.trim();
    const password     = document.getElementById('st-pwd')?.value;
    const role         = document.getElementById('st-role')?.value;
    if (!display_name || !username) { toast('Name and username required', 'warn'); return; }
    if (!password || password.length < 6) { toast('Password must be at least 6 characters', 'warn'); return; }
    await POST('/users', { username, display_name, password, role });
    closeModal();
    toast('Staff member added ✅', 'success');
    users = await GET('/users');
    c.innerHTML = html();
  };

  window.showChangePassword = (id, name) => {
    modal(`🔑 Change Password — ${name}`, `
      <div class="field"><label>New Password *</label><input class="input" type="password" id="np-pwd" placeholder="Min 6 characters"></div>
      <div class="field"><label>Confirm Password</label><input class="input" type="password" id="np-pwd2" placeholder="Repeat password"></div>`,
      `<button class="btn btn-outline" style="flex:1" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" style="flex:1" onclick="updatePassword(${id})">Update</button>`
    );
  };

  window.updatePassword = async (id) => {
    const pwd  = document.getElementById('np-pwd')?.value;
    const pwd2 = document.getElementById('np-pwd2')?.value;
    if (!pwd || pwd.length < 6) { toast('Min 6 characters', 'warn'); return; }
    if (pwd !== pwd2) { toast('Passwords do not match', 'warn'); return; }
    await PUT('/users/' + id + '/password', { password: pwd });
    closeModal();
    toast('Password updated ✅', 'success');
  };

  window.toggleStaff = async (id) => {
    await PUT('/users/' + id + '/toggle');
    users = await GET('/users');
    c.innerHTML = html();
  };
}
