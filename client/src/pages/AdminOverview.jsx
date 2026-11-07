import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, errMsg, fmtDate } from '../api.js';
import { PageTitle, StatCard, Spinner, ErrorBox } from '../components/ui.jsx';
import { AuditTable } from '../components/DocModals.jsx';

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/admin/stats').then((r) => setData(r.data)).catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  const t = data.totals;

  return (
    <>
      <PageTitle title="Security overview" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Users" value={t.users} />
        <StatCard label="Documents" value={t.documents} />
        <StatCard label="Downloads" value={t.downloads} />
        <StatCard label="Permission changes" value={t.permissionChanges} />
        <StatCard label="Failed access attempts (all time)" value={t.failedAttempts} tone={t.failedAttempts > 0 ? 'bad' : undefined} />
        <StatCard label="Failed attempts (last 24 hours)" value={t.failed24h} tone={t.failed24h > 0 ? 'bad' : undefined} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Activity, last 7 days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="events" name="All events" fill="#2f6fed" radius={[3, 3, 0, 0]} />
                <Bar dataKey="denied" name="Denied" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Suspicious activity (last hour)</h2>
          {data.suspicious.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Nothing unusual right now.</div>
          ) : (
            <ul className="space-y-3">
              {data.suspicious.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span><span className="font-medium">{s.kind}</span><br /><span className="text-slate-600">{s.who} · {s.count} events</span></span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">Flagged when one user or IP address causes 5 or more denied events in an hour.</p>
        </div>
      </div>

      <div className="card mb-6 p-4">
        <h2 className="mb-3 font-semibold">Recent uploads</h2>
        {data.recentUploads.length === 0 ? <p className="text-sm text-slate-500">No uploads yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {data.recentUploads.map((u) => (
              <li key={u.id} className="flex justify-between py-2"><span>{u.title} <span className="text-slate-500">by {u.ownerName}</span></span><span className="text-slate-500">{fmtDate(u.createdAt)}</span></li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Recent audit events</h2>
      <div className="card"><AuditTable items={data.recentEvents} /></div>
    </>
  );
}
