// api.js — fetch wrapper + auth token management
const API = '/api';

export function setSession(token, user) {
  localStorage.setItem('pp_token', token);
  localStorage.setItem('pp_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('pp_token');
  localStorage.removeItem('pp_user');
}

export function getUser()  {
  return JSON.parse(localStorage.getItem('pp_user') || 'null');
}
export function getToken() {
  return localStorage.getItem('pp_token') || '';
}
export function isLoggedIn() {
  return !!localStorage.getItem('pp_token');
}

export async function api(method, path, body, requireAuth = true) {
  const token = getToken();
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (requireAuth && token) opts.headers['X-Token'] = token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  if (r.status === 401) {
    clearSession();
    window.location.reload();
    return;
  }
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(txt);
  }
  return r.json();
}

export const GET    = (p)    => api('GET',    p);
export const POST   = (p, b) => api('POST',   p, b);
export const PUT    = (p, b) => api('PUT',    p, b);
export const DELETE = (p)    => api('DELETE', p);
