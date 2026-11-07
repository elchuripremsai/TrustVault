import { useCallback, useEffect, useState } from 'react';
import { Upload, Search } from 'lucide-react';
import { api, errMsg, CATEGORIES } from '../api.js';
import { PageTitle, StatCard, Spinner, ErrorBox } from '../components/ui.jsx';
import DocTable from '../components/DocTable.jsx';
import { UploadModal, AuditTable } from '../components/DocModals.jsx';

export default function OwnerDashboard() {
  const [docs, setDocs] = useState(null);
  const [activity, setActivity] = useState([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        api.get('/documents', { params: { q: q || undefined, category: category || undefined } }),
        api.get('/documents/activity'),
      ]);
      setDocs(d.data.documents.filter((x) => x.access === 'OWNER'));
      setActivity(a.data.items);
      setError('');
    } catch (e) {
      setError(errMsg(e));
    }
  }, [q, category]);

  useEffect(() => {
    const t = setTimeout(load, 250); // wait a moment while the user is typing
    return () => clearTimeout(t);
  }, [load]);

  const shared = docs ? docs.filter((d) => d.sharedCount > 0).length : 0;

  return (
    <>
      <PageTitle title="My documents">
        <button className="btn-primary" onClick={() => setUploading(true)}><Upload className="h-4 w-4" /> Upload document</button>
      </PageTitle>
      <ErrorBox message={error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Documents I own" value={docs ? docs.length : '…'} />
        <StatCard label="Currently shared with others" value={docs ? shared : '…'} />
      </div>

      <div className="card mb-6">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search by title or description" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {!docs ? <Spinner /> : <DocTable docs={docs} onChanged={load} emptyText="No documents yet. Upload your first one." />}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Recent activity on my documents</h2>
      <div className="card">
        {activity.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-500">Nothing has happened yet.</div> : <AuditTable items={activity} />}
      </div>

      {uploading && <UploadModal onClose={() => setUploading(false)} onDone={() => { setUploading(false); load(); }} />}
    </>
  );
}
