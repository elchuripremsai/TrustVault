import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext.jsx';
import { api, errMsg } from '../api.js';
import { ErrorBox } from '../components/ui.jsx';

// A picture of what makes TrustVault different: every event is chained to the one before it.
const CHAIN = [
  { a: 'UPLOAD', who: 'owner', prev: '9f3a…c71e', hash: '41bd…07aa' },
  { a: 'PERMISSION_GRANTED', who: 'owner', prev: '41bd…07aa', hash: 'c8e2…5d90' },
  { a: 'ACCESS_DENIED', who: 'outsider', prev: 'c8e2…5d90', hash: '07f1…b3c4' },
  { a: 'PERMISSION_REVOKED', who: 'owner', prev: '07f1…b3c4', hash: 'a2d6…19ef' },
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setNeedsVerification(false);
    try {
      if (mode === 'register') {
        const response = await api.post('/auth/register', { name, email, password });
        setNotice(response.data.message);
      } else {
        await login(email, password);
        nav('/', { replace: true });
      }
    } catch (err) {
      setError(errMsg(err));
      setNeedsVerification(err.response?.data?.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/auth/resend-verification', { email });
      setNotice(response.data.message);
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
          <h1 className="text-2xl font-semibold">{mode === 'login' ? 'Log in' : 'Create your account'}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">
            {mode === 'login' ? 'Use your TrustVault account.' : 'Verify your email address to activate your account.'}
          </p>
          <ErrorBox message={error} />
          {notice && <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{notice}</p>}
          {mode === 'register' && (
            <>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required />
            </>
          )}
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} required />
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input mb-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 12 : 1}
            maxLength={100}
            required
          />
          {mode === 'register' && <p className="mb-5 text-xs text-slate-500">Use at least 12 characters.</p>}
          {mode === 'login' && <div className="mb-5" />}
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          {needsVerification && (
            <button type="button" className="mt-3 w-full text-sm font-medium text-navy-700 underline" onClick={resendVerification} disabled={busy}>
              Resend verification email
            </button>
          )}
          <div className="mt-5 text-center text-sm text-slate-600">
            {mode === 'login' ? "New to TrustVault? " : 'Already have an account? '}
            <button
              type="button"
              className="font-medium text-navy-800 underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
                setNotice('');
                setNeedsVerification(false);
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Log in'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
