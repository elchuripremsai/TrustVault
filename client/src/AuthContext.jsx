import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then((r) => { sessionStorage.setItem('tv_csrf', r.data.csrf); setUser(r.data.user); })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    sessionStorage.setItem('tv_csrf', r.data.csrf);
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch (e) { /* session may already be gone */ }
    sessionStorage.removeItem('tv_csrf');
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
