import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { api, errMsg, fetchFile, fmtDate, fmtSize, CATEGORIES } from '../api.js';
import { Modal, ConfirmDialog, ErrorBox, Spinner, Badge, Empty } from './ui.jsx';

// ---------- Preview (only safe types; everything else must be downloaded) ----------
export function PreviewModal({ doc, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let url;
    let gone = false;
    (async () => {
      try {
        const type = doc.mimeType || '';
        const previewable = type === 'application/pdf' || type.startsWith('image/') || type.startsWith('text/plain');
        if (!previewable) return setState({ loading: false, none: true });
        const blob = await fetchFile(doc.id, { preview: true });
        if (gone) return;
        if (type.startsWith('text/plain')) return setState({ loading: false, text: await blob.text() });
        url = URL.createObjectURL(blob);
        setState({ loading: false, url, image: type.startsWith('image/') });
      } catch (e) {
        setState({ loading: false, error: 'You no longer have access to this file, or it could not be loaded.' });
      }
    })();
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [doc.id, doc.mimeType]);

  return (
    <Modal title={doc.title} onClose={onClose} wide>
      {state.loading && <Spinner />}
      <ErrorBox message={state.error} />
      {state.none && <Empty>Preview is not available for this file type. Use Download instead.</Empty>}
      {state.text !== undefined && <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-mist p-4 font-mono text-sm">{state.text}</pre>}
      {state.url && state.image && <img src={state.url} alt={doc.title} className="mx-auto max-h-[60vh]" />}
      {state.url && !state.image && <iframe title={doc.title} src={state.url} className="h-[65vh] w-full rounded border border-slate-200" />}
    </Modal>
  );
}

// ---------- Edit details / upload a new version ----------
export function EditModal({ doc, onClose, onDone }) {
  const [form, setForm] = useState({ title: doc.title, category: doc.category, description: doc.description || '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.put(`/documents/${doc.id}`, form);
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/documents/${doc.id}/versions`, fd);
      }
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit document" onClose={onClose}>
      <form onSubmit={save}>
        <ErrorBox message={error} />
        <label className="label">Title</label>
        <input className="input mb-3" value={form.title} onChange={set('title')} required maxLength={200} />
        <label className="label">Category</label>
        <select className="input mb-3" value={form.category} onChange={set('category')}>
          {[...new Set([form.category, ...CATEGORIES])].map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="label">Description</label>
        <textarea className="input mb-3" rows={3} value={form.description} onChange={set('description')} maxLength={2000} />
        <label className="label">Replace file with a new version (optional)</label>
        <input type="file" className="input mb-5" onChange={(e) => setFile(e.target.files[0] || null)} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Upload ----------
export function UploadModal({ onClose, onDone }) {
  const [form, setForm] = useState({ title: '', category: 'General', description: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!file) return setError('Please choose a file.');
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('file', file);
      await api.post('/documents', fd);
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Upload document" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox message={error} />
        <label className="label">Title</label>
        <input className="input mb-3" value={form.title} onChange={set('title')} required maxLength={200} />
        <label className="label">Category</label>
        <select className="input mb-3" value={form.category} onChange={set('category')}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="label">Description (optional)</label>
        <textarea className="input mb-3" rows={2} value={form.description} onChange={set('description')} maxLength={2000} />
        <label className="label">File</label>
        <input type="file" className="input" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx,.xlsx" onChange={(e) => setFile(e.target.files[0] || null)} />
        <p className="mb-5 mt-1 text-xs text-slate-500">PDF, PNG, JPG, TXT, DOCX or XLSX, up to 10 MB. The server checks the real file content, not just the name.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Upload</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Share / revoke ----------
export function ShareModal({ doc, onClose, onChanged }) {
  const [perms, setPerms] = useState(null);
  const [email, setEmail] = useState('');
  const [type, setType] = useState('READ');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);

  const load = () => api.get(`/documents/${doc.id}/permissions`).then((r) => setPerms(r.data.permissions)).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, [doc.id]);

  async function grant(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/documents/${doc.id}/permissions`, { email, type });
      setEmail('');
      await load();
      onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await api.delete(`/documents/${doc.id}/permissions/${confirm.id}`);
      setConfirm(null);
      await load();
      onChanged();
    } catch (err) {
      setError(errMsg(err));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Share “${doc.title}”`} onClose={onClose} wide>
      <ErrorBox message={error} />
      <form onSubmit={grant} className="mb-6 flex flex-wrap gap-2">
        <input type="email" className="input min-w-[14rem] flex-1" placeholder="Email of a registered user" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="READ">Can read</option>
          <option value="EDIT">Can edit</option>
        </select>
        <button className="btn-primary" disabled={busy}>Grant access</button>
      </form>
      {!perms ? <Spinner /> : perms.length === 0 ? <Empty>Not shared with anyone yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Person</th><th className="th">Access</th><th className="th">Granted</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {perms.map((p) => (
                <tr key={p.id}>
                  <td className="td"><div className="font-medium">{p.userName}</div><div className="text-xs text-slate-500">{p.userEmail}</div></td>
                  <td className="td"><Badge kind={p.type}>{p.type === 'READ' ? 'Read' : 'Edit'}</Badge></td>
                  <td className="td text-slate-600">{fmtDate(p.grantedAt)}</td>
                  <td className="td">{p.revoked ? <Badge kind="REVOKED">Revoked {fmtDate(p.revokedAt)}</Badge> : <Badge kind="ACTIVE">Active</Badge>}</td>
                  <td className="td text-right">
                    {!p.revoked && <button className="btn-ghost !py-1 text-red-600" onClick={() => setConfirm(p)}><Trash2 className="h-4 w-4" /> Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title="Revoke access?"
          message={`${confirm.userName} will lose access to this document immediately. This is recorded in the audit trail.`}
          confirmLabel="Revoke access" danger busy={busy} onConfirm={revoke} onCancel={() => setConfirm(null)}
        />
      )}
    </Modal>
  );
}

// ---------- Audit history of one document ----------
export function HistoryModal({ doc, onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/documents/${doc.id}/audit`).then((r) => setItems(r.data.items)).catch((e) => setError(errMsg(e)));
  }, [doc.id]);
  return (
    <Modal title={`History: ${doc.title}`} onClose={onClose} wide>
      <ErrorBox message={error} />
      {!items && !error && <Spinner />}
      {items && items.length === 0 && <Empty>No events yet.</Empty>}
      {items && items.length > 0 && <AuditTable items={items} compact />}
    </Modal>
  );
}

export function AuditTable({ items, compact }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">When</th><th className="th">Who</th><th className="th">Action</th>
            {!compact && <th className="th">Document</th>}
            <th className="th">Result</th>{!compact && <th className="th">IP</th>}<th className="th">Hash</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((e) => (
            <tr key={e.id}>
              <td className="td whitespace-nowrap text-slate-600">{fmtDate(e.createdAt)}</td>
              <td className="td">{e.userName || <span className="text-slate-400">unknown</span>}</td>
              <td className="td font-mono text-xs">{e.action}</td>
              {!compact && <td className="td">{e.documentTitle || '-'}</td>}
              <td className="td"><Badge kind={e.result}>{e.result === 'DENIED' ? 'Denied' : 'Success'}</Badge></td>
              {!compact && <td className="td font-mono text-xs text-slate-500">{e.ipAddress || '-'}</td>}
              <td className="td font-mono text-xs text-slate-400" title={e.currentHash}>{e.currentHash.slice(0, 8)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { fmtSize };
