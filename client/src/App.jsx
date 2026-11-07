import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import AdminOverview from './pages/AdminOverview.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminDocuments from './pages/AdminDocuments.jsx';
import AdminAudit from './pages/AdminAudit.jsx';
import OwnerDashboard from './pages/OwnerDashboard.jsx';
import SharedWithMe from './pages/SharedWithMe.jsx';

const home = (role) => (role === 'ADMIN' ? '/admin' : role === 'OWNER' ? '/owner' : '/shared');

// NOTE: these route guards only decide what is SHOWN. The server checks permissions on every request.
function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-screen place-items-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout><Outlet /></Layout>;
}

function RoleRoute({ roles }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? <Outlet /> : <Navigate to={home(user.role)} replace />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={home(user.role)} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route path="/" element={<Home />} />
            <Route element={<RoleRoute roles={['ADMIN']} />}>
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/documents" element={<AdminDocuments />} />
              <Route path="/admin/audit" element={<AdminAudit />} />
            </Route>
            <Route element={<RoleRoute roles={['OWNER']} />}>
              <Route path="/owner" element={<OwnerDashboard />} />
            </Route>
            <Route path="/shared" element={<SharedWithMe />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
