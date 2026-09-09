import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Heatmap } from './pages/Heatmap';
import { Alerts } from './pages/Alerts';
import { PredictionDetail } from './pages/PredictionDetail';
import { Investigation } from './pages/Investigation';
import { Settings } from './pages/Settings';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loading } from './components/ui';

import InvestigationWorkspace from './components/InvestigationWorkspace';
import { ComplaintsPage } from './pages/Complaints';
import CasesPage from './pages/CasesPage';
import CyberBackground from './components/CyberBackground';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <CyberBackground />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="heatmap" element={<Heatmap />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="complaints" element={<ComplaintsPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route path="cases/:id" element={<Investigation />} />
          <Route path="cases/:id/graph" element={<InvestigationWorkspace />} />
          <Route path="predictions/:id" element={<PredictionDetail />} />
          <Route path="investigations/:id" element={<Investigation />} />
          <Route path="investigations/:id/graph" element={<InvestigationWorkspace />} />
          <Route path="graph" element={<InvestigationWorkspace />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

