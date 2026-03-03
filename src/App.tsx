// src/App.tsx

import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from '@/store';
import { loadAllContent } from '@/lib/contentLoader';
import Layer1World from '@/components/Layer1World/Layer1World';
import Layer2Stage from '@/components/Layer2Stage/Layer2Stage';
import Layer3Controls from '@/components/Layer3Controls/Layer3Controls';
import Loader from '@/components/Loader/Loader';
import styles from './App.module.css';

// ─── Lazy admin bundle — only downloaded when /admin route is active ──────────

const AdminApp = lazy(() => import('./admin/AdminApp'));

// ─── Route detection — no React Router needed for two routes ─────────────────

const isAdminRoute = (): boolean =>
  typeof window !== 'undefined' &&
  window.location.pathname.startsWith('/admin');

// ─── Maintenance overlay ──────────────────────────────────────────────────────

const MaintenanceOverlay = (): JSX.Element => (
  <div className={styles.maintenanceOverlay}>
    <div className={styles.maintenanceContent}>
      <p className={styles.maintenanceIcon}>🔧</p>
      <h1 className={styles.maintenanceTitle}>Under Maintenance</h1>
      <p className={styles.maintenanceText}>
        This site is temporarily unavailable. Check back soon.
      </p>
    </div>
  </div>
);

// ─── Admin suspense fallback ──────────────────────────────────────────────────

const AdminFallback = (): JSX.Element => (
  <div className={styles.adminFallback}>Loading admin…</div>
);

// ─── Root component ───────────────────────────────────────────────────────────

const App = (): JSX.Element => {
  const detailPage    = useStore((s) => s.detailPage);
  const closeDetail   = useStore((s) => s.closeDetail);
  const contentLoaded = useStore((s) => s.contentLoaded);

  // ── Maintenance mode — fetched independently from site_settings ────────────
  // The store does not carry siteSettings; we fetch the single key here so the
  // rest of the portfolio data pipeline is unaffected.
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);

  // ── Determine route once on mount (pathname never changes in an SPA) ────────
  const [onAdminRoute] = useState<boolean>(() => isAdminRoute());

  // ── Load all portfolio content once on mount ────────────────────────────────
  useEffect(() => {
    if (onAdminRoute) return; // Admin panel handles its own data fetching
    loadAllContent();
  }, [onAdminRoute]);

  // ── Fetch maintenance_mode setting (portfolio only) ─────────────────────────
  useEffect(() => {
    if (onAdminRoute) return;

    const fetchMaintenanceMode = async (): Promise<void> => {
      try {
        const res = await fetch('/api/admin/stats');
        if (!res.ok) return;
        const data = await res.json() as Record<string, unknown>;
        const raw = data['maintenance_mode'];
        if (raw === true || raw === 'true') {
          setMaintenanceMode(true);
        }
        const validThemes = ['space', 'ocean', 'forest', 'ember', 'minimal'];
        const savedTheme = data['default_theme'];
        if (typeof savedTheme === 'string' && validThemes.includes(savedTheme)) {
          useStore.getState().setActiveTheme(savedTheme as import('@/types').ThemeName);
        }
        const validLayouts = ['arc', 'dock', 'scattered', 'orbital'];
        const savedLayout = data['default_layout'];
        if (typeof savedLayout === 'string' && validLayouts.includes(savedLayout)) {
          useStore.getState().setActiveLayout(savedLayout as import('@/types').LayoutName);
        }
      } catch {
        // Non-critical — silently ignore; site defaults to non-maintenance mode
      }
    };

    fetchMaintenanceMode();
  }, [onAdminRoute]);

  // ── Global Escape key → close detail page ───────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && detailPage !== null) {
        closeDetail();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailPage, closeDetail]);

  // ── Admin route ─────────────────────────────────────────────────────────────
  if (onAdminRoute) {
    return (
      <Suspense fallback={<AdminFallback />}>
        <AdminApp />
      </Suspense>
    );
  }

  // ── Portfolio route ─────────────────────────────────────────────────────────
  return (
    <div className={styles.appRoot}>
      {/*
        Layer 1 — particle world.
        Renders immediately (even before content is loaded) so the visitor
        sees a live animated background behind the loader.
      */}
      <Layer1World />

      {/*
        Loader — visible until contentLoaded becomes true, then fades out
        and removes itself from the DOM.
      */}
      <Loader />

      {/*
        Layer 2 — glass content stage.
        Rendered always so the entrance animation can play correctly;
        section components handle their own empty/loading states.
      */}
      {maintenanceMode ? (
        <MaintenanceOverlay />
      ) : (
        <div className={styles.layer2Stage}>
  <Layer2Stage />
</div>
      )}

      {/*
        Layer 3 — arc navigation and four corner controls.
        Hidden implicitly when admin route is active (never rendered there).
      */}
      <Layer3Controls />
    </div>
  );
};

export default App;