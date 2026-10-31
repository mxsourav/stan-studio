import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Studio from './pages/Studio';
import Admin from './pages/Admin';

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Domain isolation: the admin panel exists ONLY on admin.* hosts
 * (admin.mxsourav.dev). On the store domains the /admin route redirects
 * home and no admin links are rendered. localhost keeps full access so
 * local development can reach both sides.
 */
const HOSTNAME = window.location.hostname;
const IS_ADMIN_HOST = HOSTNAME.startsWith('admin.');
const ADMIN_ALLOWED = IS_ADMIN_HOST || HOSTNAME === 'localhost' || HOSTNAME === '127.0.0.1';

function AppRoutes() {
  if (IS_ADMIN_HOST) {
    // The admin subdomain boots straight into the passkey gate; every other
    // path folds into it — the store never renders here.
    return (
      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
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
