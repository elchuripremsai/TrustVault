import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { api, errMsg } from '../api.js';

export default function VerifyEmail() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  const started = useRef(false);
  const [state, setState] = useState({ loading: true, message: '' });

  useEffect(() => {
    if (started.current) return undefined;
    started.current = true;
    let active = true;
    if (!token) {
      setState({ loading: false, message: 'This verification link is missing its token.' });
      return () => { active = false; };
    }

    api.post('/auth/verify-email', { token })
      .then((response) => {
        if (active) setState({ loading: false, message: response.data.message });
      })
      .catch((error) => {
        if (active) setState({ loading: false, message: errMsg(error) });
      });

    return () => { active = false; };
  }, [token]);

  return (
    <main className="grid min-h-screen place-items-center bg-mist p-6">
      <section className="card w-full max-w-md p-8 text-center">
        <div className="mb-5 flex justify-center text-navy-800"><ShieldCheck className="h-9 w-9" /></div>
        <h1 className="text-2xl font-semibold">Verify your email</h1>
        <p className="mt-3 text-sm text-slate-600" role="status">
          {state.loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking your verification link…</span> : state.message}
        </p>
        {!state.loading && (
          <Link className="btn-primary mt-6" to="/login">Continue to login</Link>
        )}
      </section>
    </main>
  );
}
