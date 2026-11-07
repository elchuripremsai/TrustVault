import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { api, errMsg, fmtDate, fmtSize } from '../api.js';
import { PageTitle, Spinner, ErrorBox, Empty } from '../components/ui.jsx';

export default function AdminDocuments() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/admin/documents').then((r) => setDocs(r.data.documents)).catch((e) => setError(errMsg(e))); }, []);

  return (
    <>
      <PageTitle title="Documents" />
      <p className="mb-4 flex items-center gap-2 text-sm text-slate-600"><Lock className="h-4 w-4" /> Admins see details about documents, never their contents, unless an owner grants access explicitly.</p>
      <ErrorBox message={error} />
      <div className="card overflow-x-auto">
        {!docs ? <Spinner /> : docs.length === 0 ? <Empty>No documents have been uploaded.</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">Title</th><th className="th">Category</th><th className="th">Owner</th><th className="th">Version</th><th className="th">Size</th><th className="th">Shared with</th><th className="th">Uploaded</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="td font-medium">{d.title}</td><td className="td text-slate-600">{d.category}</td>
                  <td className="td"><div>{d.ownerName}</div><div className="text-xs text-slate-500">{d.ownerEmail}</div></td>
                  <td className="td text-slate-600">v{d.currentVersion}</td><td className="td text-slate-600">{fmtSize(d.sizeBytes)}</td>
                  <td className="td text-slate-600">{d.sharedCount} people</td><td className="td text-slate-600">{fmtDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
