import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, errMsg, fmtDate } from '../api.js';
import { PageTitle, Spinner, ErrorBox, Badge, Modal, ConfirmDialog } from '../components/ui.jsx';
import { useAuth } from '../AuthContext.jsx';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [toggle, setToggle] = useState(null);

  const load = useCallback(() => api.get('/admin/users').then((r) => setUsers(r.data.users)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  async function patch(id, body) {
    setError('');
    try { await api.patch(`/admin/users/${id}`, body); await load(); } catch (e) { setError(errMsg(e)); }
  }

  return (
    <>
      <PageTitle title="Users">
        <button className="btn-primary" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add user</button>
      </PageTitle>
      <ErrorBox message={error} />
      <div className="card overflow-x-auto">
        {!users ? <Spinner /> : (
          <table className="w-full">
            <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th><th className="th">Created</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="td font-medium">{u.name}</td>
                  <td className="td text-slate-600">{u.email}</td>
                  <td className="td">
                    {u.id === me.id ? <Badge kind={u.role}>{u.role.toLowerCase()}</Badge> : (
                      <select className="input !w-auto !py-1" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                        <option value="ADMIN">admin</option><option value="OWNER">owner</option><option value="VIEWER">viewer</option>
                      </select>
                    )}
                  </td>
                  <td className="td"><Badge kind={u.isActive ? 'ACTIVE' : 'REVOKED'}>{u.isActive ? 'Active' : 'Deactivated'}</Badge></td>
                  <td className="td text-slate-600">{fmtDate(u.createdAt)}</td>
                  <td className="td text-right">
                    {u.id !== me.id && <button className="btn-ghost !py-1" onClick={() => (u.isActive ? setToggle(u) : patch(u.id, { isActive: true }))}>{u.isActive ? 'Deactivate' : 'Reactivate'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {adding && <AddUser onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {toggle && (
        <ConfirmDialog
          title="Deactivate this account?" message={`${toggle.name} will be logged out and will not be able to log in again until you reactivate the account.`}
          confirmLabel="Deactivate" danger onCancel={() => setToggle(null)} onConfirm={async () => { await patch(toggle.id, { isActive: false }); setToggle(null); }}
        />
      )}
    </>
  );
}

function AddUser({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'VIEWER' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try { await api.post('/admin/users', f); onDone(); } catch (err) { setError(errMsg(err)); }
  }
  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox message={error} />
        <label className="label">Full name</label><input className="input mb-3" value={f.name} onChange={set('name')} required />
        <label className="label">Email</label><input type="email" className="input mb-3" value={f.email} onChange={set('email')} required />
        <label className="label">Temporary password (at least 10 characters)</label><input type="password" className="input mb-3" value={f.password} onChange={set('password')} minLength={10} required autoComplete="new-password" />
        <label className="label">Role</label>
        <select className="input mb-5" value={f.role} onChange={set('role')}><option value="VIEWER">Viewer</option><option value="OWNER">Owner</option><option value="ADMIN">Admin</option></select>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">Create user</button></div>
      </form>
    </Modal>
  );
}
