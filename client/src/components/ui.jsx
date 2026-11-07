import { X, Loader2, AlertCircle } from 'lucide-react';

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy-950/50" onClick={onClose} />
      <div className={`relative max-h-[90vh] w-full overflow-auto rounded-lg bg-white shadow-xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="mb-5 text-sm text-slate-600">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {label}</div>
);

export const ErrorBox = ({ message }) =>
  message ? (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </div>
  ) : null;

export const Empty = ({ children }) => <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;

export const PageTitle = ({ title, children }) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <div className="flex gap-2">{children}</div>
  </div>
);

export const StatCard = ({ label, value, tone }) => (
  <div className="card p-4">
    <div className="text-sm text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-semibold ${tone === 'bad' ? 'text-red-600' : ''}`}>{value}</div>
  </div>
);

const TONES = {
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  DENIED: 'bg-red-50 text-red-700',
  OWNER: 'bg-navy-900 text-white',
  EDIT: 'bg-amber-50 text-amber-800',
  READ: 'bg-slate-100 text-slate-700',
  ADMIN: 'bg-navy-900 text-white',
  VIEWER: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  REVOKED: 'bg-slate-100 text-slate-500',
};
export const Badge = ({ kind, children }) => <span className={`badge ${TONES[kind] || 'bg-slate-100 text-slate-700'}`}>{children || kind}</span>;
