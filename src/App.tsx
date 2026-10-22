import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast.js';
import { AuthProvider, useAuth } from './hooks/useAuth.js';
import { SuperAdminAuthProvider, useSuperAdminAuth } from './hooks/useSuperAdminAuth.js';
import { PhotographerLayout } from './components/layout/PhotographerLayout.js';
import Login from './pages/Login.js';
import Dashboard from './pages/Dashboard.js';
import CreateEvent from './pages/CreateEvent.js';
import EventDetails from './pages/EventDetails.js';
import PublicWedding from './pages/PublicWedding.js';
import SuperAdminLogin from './pages/superadmin/SuperAdminLogin.js';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard.js';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

function SuperAdminGate() {
  const { admin, loading } = useSuperAdminAuth();
  if (loading) return null;
  return admin ? <SuperAdminDashboard /> : <SuperAdminLogin />;
}

function SuperAdminProtected() {
  const { admin, loading } = useSuperAdminAuth();
  if (loading) return null;
  return admin ? <SuperAdminDashboard /> : <Navigate to="/superadmin" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SuperAdminAuthProvider>
          <AuthProvider>
            <Routes>
              {/* Root routing */}
              <Route path="/" element={<RootRedirect />} />

              {/* Public Photographer Auth Route */}
              <Route path="/login" element={<Login />} />

              {/* Penta Prizm Super Admin Routes */}
              <Route path="/superadmin" element={<SuperAdminGate />} />
              <Route path="/superadmin/login" element={<SuperAdminLogin />} />
              <Route path="/superadmin/dashboard" element={<SuperAdminProtected />} />

              {/* Public Guest Wedding Routes */}
              <Route path="/w/:token" element={<PublicWedding />} />
              <Route path="/wedding/:token" element={<PublicWedding />} />

              {/* Protected Photographer Routes */}
              <Route element={<PhotographerLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/events/new" element={<CreateEvent />} />
                <Route path="/events/:id" element={<EventDetails />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </SuperAdminAuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
