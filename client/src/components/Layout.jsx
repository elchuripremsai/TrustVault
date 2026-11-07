import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, ScrollText, Share2, LogOut, Menu, X, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext.jsx';

const NAV = {
  ADMIN: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/documents', label: 'Documents', icon: FileText },
    { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
    { to: '/shared', label: 'Shared with me', icon: Share2 },
  ],
  OWNER: [
    { to: '/owner', label: 'My documents', icon: LayoutDashboard },
    { to: '/shared', label: 'Shared with me', icon: Share2 },
  ],
  VIEWER: [{ to: '/shared', label: 'Shared with me', icon: Share2 }],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-navy-900 text-slate-200">
      <div className="flex items-center gap-2 px-5 py-5 text-lg font-semibold text-white">
        <ShieldCheck className="h-6 w-6 text-signal" /> TrustVault
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV[user.role].map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-navy-700 text-white' : 'text-slate-300 hover:bg-navy-800'}`
            }
          >
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-navy-700 p-4">
        <div className="text-sm font-medium text-white">{user.name}</div>
        <div className="mb-3 text-xs text-slate-400">{user.role.toLowerCase()} · {user.email}</div>
        <button onClick={logout} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-navy-800">
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Open menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        <span className="font-semibold">TrustVault</span>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
