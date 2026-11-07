import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext.jsx';
import { errMsg } from '../api.js';
import { ErrorBox } from '../components/ui.jsx';

// A picture of what makes TrustVault different: every event is chained to the one before it.
const CHAIN = [
  { a: 'UPLOAD', who: 'owner', prev: '9f3a…c71e', hash: '41bd…07aa' },
  { a: 'PERMISSION_GRANTED', who: 'owner', prev: '41bd…07aa', hash: 'c8e2…5d90' },
  { a: 'ACCESS_DENIED', who: 'outsider', prev: 'c8e2…5d90', hash: '07f1…b3c4' },
  { a: 'PERMISSION_REVOKED', who: 'owner', prev: '07f1…b3c4', hash: 'a2d6…19ef' },
];

const DEMO = [
  { label: 'Admin', email: 'admin@trustvault.demo' },
  { label: 'Owner', email: 'owner@trustvault.demo' },
  { label: 'Viewer', email: 'viewer@trustvault.demo' },
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      nav('/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-6 w-6 text-signal" /> TrustVault</div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Share confidential files. Prove exactly who touched them.</h2>
          <p className="mt-3 max-w-md text-slate-300">Every action is written to an audit trail where each event carries the fingerprint of the one before it. Change one record and the chain breaks.</p>
          <ol className="mt-8 max-w-md space-y-0">
            {CHAIN.map((c, i) => (
              <li key={i} className="relative border-l border-navy-600 pb-5 pl-5 last:pb-0">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-signal" />
                <div className="text-sm font-medium">{c.a} <span className="font-normal text-slate-400">by {c.who}</span></div>
                <div className="mt-0.5 font-mono text-xs text-slate-400">prev {c.prev} → hash <span className="text-slate-200">{c.hash}</span></div>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-slate-400">Access is checked in the database on every request. Revoking takes effect immediately.</p>
      </section>

      <section className="flex items-center justify-center bg-white p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">Log in</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">Use your company account.</p>
          <ErrorBox message={error} />
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input mb-5" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
          </button>
          <div className="mt-8 rounded-md bg-mist p-3 text-sm">
            <div className="mb-2 text-slate-600">Demo accounts (fills the email; the password is in the README):</div>
            <div className="flex gap-2">
              {DEMO.map((d) => (
                <button type="button" key={d.label} className="btn-ghost flex-1 !px-2 !py-1.5" onClick={() => setEmail(d.email)}>{d.label}</button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
