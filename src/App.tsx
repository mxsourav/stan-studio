import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Studio from './pages/Studio';
import Admin from './pages/Admin';
import { ADMIN_ALLOWED, IS_ADMIN_HOST } from './lib/host';

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Domain isolation: on admin.* hosts (admin.mxsourav.dev) the admin panel
 * renders at the clean root URL — every path serves it, the store never
 * appears there. On store domains /admin redirects home (no admin surface),
 * while localhost keeps both sides reachable for development.
 */
function AppRoutes() {
  if (IS_ADMIN_HOST) {
    return (
      <Routes>
        <Route path="*" element={<Admin />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/studio" element={<Studio />} />
      {ADMIN_ALLOWED ? (
        <Route path="/admin" element={<Admin />} />
      ) : (
        <Route path="/admin" element={<Navigate to="/" replace />} />
      )}
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollReset />
      <AppRoutes />
    </BrowserRouter>
  );
}
