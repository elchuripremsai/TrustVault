import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// Every request carries the CSRF token we received at login.
api.interceptors.request.use((cfg) => {
  const t = sessionStorage.getItem('tv_csrf');
  if (t) cfg.headers['x-csrf-token'] = t;
  return cfg;
});

export const errMsg = (e) => e?.response?.data?.error || e?.message || 'Something went wrong.';

export const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-');

export function fmtSize(b) {
  if (b == null) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export const CATEGORIES = ['General', 'Contracts', 'Finance', 'HR', 'Legal', 'Engineering', 'Other'];

// Files are fetched through the authenticated API as a blob. There is never a public file URL.
export async function fetchFile(id, { preview = false, version } = {}) {
  const r = await api.get(`/documents/${id}/download`, { params: { preview: preview ? 1 : undefined, version }, responseType: 'blob' });
  return r.data;
}

export async function downloadFile(doc) {
  const blob = await fetchFile(doc.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName || 'document';
  a.click();
  URL.revokeObjectURL(url);
}
