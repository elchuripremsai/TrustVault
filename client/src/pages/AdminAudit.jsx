import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { PageTitle, Spinner, ErrorBox, Empty } from '../components/ui.jsx';
import { AuditTable } from '../components/DocModals.jsx';

const ACTIONS = ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'UPLOAD', 'VIEW', 'DOWNLOAD', 'UPDATE', 'DELETE', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'ACCESS_DENIED', 'CSRF_REJECTED', 'USER_CREATED', 'USER_UPDATED'];

export default function AdminAudit() {
  const [f, setF] = useState({ userId: '', documentId: '', action: '', result: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [verify, setVerify] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  useEffect(() => { api.get('/admin/users').then((r) => setUsers(r.data.users)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    const params = { page, limit: 25 };
    Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
    try { const r = await api.get('/admin/audit', { params }); setData(r.data); setError(''); } catch (e) { setError(errMsg(e)); }
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function runVerify() {
    setVerifying(true);
    try { setVerify((await api.get('/admin/audit/verify')).data); } catch (e) { setError(errMsg(e)); } finally { setVerifying(false); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageTitle title="Audit log">
        <button className="btn-ghost" onClick={runVerify} disabled={verifying}>{verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify chain</button>
      </PageTitle>
      {verify && (
        verify.valid
          ? <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><ShieldCheck className="h-4 w-4" /> Chain intact. {verify.checked} events checked.</div>
          : <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><ShieldAlert className="h-4 w-4" /> Tampering detected at event #{verify.brokenAtId}: {verify.reason}</div>
      )}
      <ErrorBox message={error} />
      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <select className="input" value={f.userId} onChange={set('userId')}>
          <option value="">All users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="input" value={f.action} onChange={set('action')}>
          <option value="">All actions</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select className="input" value={f.result} onChange={set('result')}>
          <option value="">Any result</option><option value="SUCCESS">Success</option><option value="DENIED">Denied</option>
        </select>
        <input className="input" placeholder="Document ID" value={f.documentId} onChange={set('documentId')} />
        <input type="date" className="input" value={f.from} onChange={set('from')} aria-label="From date" />
        <input type="date" className="input" value={f.to} onChange={set('to')} aria-label="To date" />
      </div>
      <div className="card">
        {!data ? <Spinner /> : data.items.length === 0 ? <Empty>No events match these filters.</Empty> : <AuditTable items={data.items} />}
        {data && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>{data.total} events</span>
            <div className="flex items-center gap-2">
              <button className="btn-ghost !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {pages}</span>
              <button className="btn-ghost !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
