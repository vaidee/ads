import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { isLoggedIn } from './auth';
import Layout from './components/Layout';
import PitchLayout from './components/PitchLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdDetail from './pages/AdDetail';
import Upload from './pages/Upload';
import WeeklyEval from './pages/WeeklyEval';
import HowItWorks from './pages/HowItWorks';
import Presentation from './pages/Presentation';

// Lazy: mermaid bundles renderers for every diagram type it supports (not
// just flowcharts), which would otherwise add several hundred KB to the
// main bundle every page load, not just when someone actually visits
// /workflow.
const Workflow = lazy(() => import('./pages/Workflow'));

function RequireAuth({ children }) {
  const location = useLocation();
  if (!isLoggedIn()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/ads/:id"
        element={
          <RequireAuth>
            <AdDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/upload"
        element={
          <RequireAuth>
            <Upload />
          </RequireAuth>
        }
      />
      <Route
        path="/eval"
        element={
          <RequireAuth>
            <WeeklyEval />
          </RequireAuth>
        }
      />
      {/* Showcase section - deliberately public (no RequireAuth): static,
          no-API pages meant to be shown to an external audience (prospective
          clients, leadership) who won't have a reviewer login. */}
      <Route
        path="/how-it-works"
        element={
          <PitchLayout>
            <HowItWorks />
          </PitchLayout>
        }
      />
      <Route
        path="/workflow"
        element={
          <PitchLayout>
            <Suspense fallback={<p style={{ padding: '2rem', color: '#b3a692' }}>Loading diagram...</p>}>
              <Workflow />
            </Suspense>
          </PitchLayout>
        }
      />
      <Route
        path="/presentation"
        element={
          <PitchLayout>
            <Presentation />
          </PitchLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
