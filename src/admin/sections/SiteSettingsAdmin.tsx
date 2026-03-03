// src/admin/sections/SiteSettingsAdmin.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { ThemeName } from '../../types';
import styles from './ProjectsAdmin.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type SiteSettings = {
  site_title: string;
  meta_description: string;
  og_image_url: string;
  maintenance_mode: boolean;
  ai_enabled: boolean;
  default_theme: ThemeName;
  default_layout: 'arc' | 'dock' | 'scattered' | 'orbital';
};

type ToastState = { type: 'success' | 'error'; message: string } | null;

type SavingKey = keyof SiteSettings | 'default_layout' | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: SiteSettings = {
  site_title: '',
  meta_description: '',
  og_image_url: '',
  maintenance_mode: false,
  ai_enabled: true,
  default_theme: 'space',
  default_layout: 'arc',
};

const LAYOUT_OPTIONS: { value: 'arc' | 'dock' | 'scattered' | 'orbital'; label: string; emoji: string; description: string }[] = [
  { value: 'arc',      label: 'Arc',      emoji: '🌙', description: 'Icons arranged on a curved arc at the bottom' },
  { value: 'dock',     label: 'Dock',     emoji: '⬛', description: 'Horizontal dock bar like macOS' },
  { value: 'scattered', label: 'Scattered', emoji: '✦', description: 'Icons scattered freely across the screen' },
  { value: 'orbital',  label: 'Orbital',  emoji: '🪐', description: 'Icons orbit around the centre in a ring' },
];

const THEME_OPTIONS: { value: ThemeName; label: string; emoji: string; description: string }[] = [
  { value: 'space',   label: 'Space',   emoji: '🌌', description: 'Deep cosmos with stars and nebulae' },
  { value: 'ocean',   label: 'Ocean',   emoji: '🌊', description: 'Bioluminescent underwater world' },
  { value: 'forest',  label: 'Forest',  emoji: '🌲', description: 'Moonlit forest with fireflies' },
  { value: 'ember',   label: 'Ember',   emoji: '🔥', description: 'Warm embers and glowing ash' },
  { value: 'minimal', label: 'Minimal', emoji: '⬜', description: 'Clean geometric minimal' },
];

// ─── Cloudinary upload widget helper ─────────────────────────────────────────

declare global {
  interface Window {
    cloudinary?: {
      openUploadWidget: (
        options: Record<string, unknown>,
        callback: (
          error: unknown,
          result: { event: string; info: { secure_url: string } }
        ) => void
      ) => void;
    };
  }
}

const loadCloudinaryWidget = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.cloudinary) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://upload-widget.cloudinary.com/global/all.js';
    script.onload = () => setTimeout(resolve, 100);
    script.onerror = () => reject(new Error('Failed to load Cloudinary widget'));
    document.head.appendChild(script);
  });

const getSignedUploadOptions = async (
  folder: string,
  token: string
): Promise<Record<string, unknown>> => {
  const res = await fetch('/api/admin/upload-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ folder }),
  });
  if (!res.ok) throw new Error('Failed to get upload signature');
  return res.json() as Promise<Record<string, unknown>>;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type FieldProps = { label: string; hint?: string; children: React.ReactNode };
const Field = ({ label, hint, children }: FieldProps): JSX.Element => (
  <div className={styles.field}>
    <label className={styles.fieldLabel}>{label}</label>
    {hint && <span className={styles.fieldHint}>{hint}</span>}
    {children}
  </div>
);

type ToastProps = { toast: ToastState; onDismiss: () => void };
const Toast = ({ toast, onDismiss }: ToastProps): JSX.Element | null => {
  if (!toast) return null;
  return (
    <div
      className={`${styles.toast} ${
        toast.type === 'error' ? styles.toastError : styles.toastSuccess
      }`}
    >
      <span>{toast.message}</span>
      <button className={styles.toastClose} onClick={onDismiss} type="button">
        ✕
      </button>
    </div>
  );
};

// ─── SettingCard — white card wrapper with individual save button ──────────────

type SettingCardProps = {
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
  saveLabel?: string;
};

const SettingCard = ({
  saving,
  onSave,
  children,
  saveLabel = 'Save',
}: SettingCardProps): JSX.Element => (
  <div
    style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '20px 20px 16px',
      marginBottom: 12,
    }}
  >
    {children}
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
      <button
        className={styles.saveBtn}
        onClick={onSave}
        type="button"
        disabled={saving}
        style={{ padding: '7px 20px', fontSize: 13 }}
      >
        {saving ? 'Saving…' : saveLabel}
      </button>
    </div>
  </div>
);

// ─── Toggle row ───────────────────────────────────────────────────────────────

type ToggleRowProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
};

const ToggleRow = ({ checked, onChange, label, description }: ToggleRowProps): JSX.Element => (
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      cursor: 'pointer',
      padding: '4px 0',
    }}
  >
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: checked ? '#6366f1' : '#d1d5db',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.2s',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }}
      />
    </div>
    <div>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{description}</div>
    </div>
  </label>
);

// ─── Theme card ───────────────────────────────────────────────────────────────

type ThemeCardProps = {
  theme: { value: string; label: string; emoji: string; description: string };
  selected: boolean;
  onClick: () => void;
};

const ThemeCard = ({ theme, selected, onClick }: ThemeCardProps): JSX.Element => (
  <div
    onClick={onClick}
    style={{
      border: selected ? '2px solid #6366f1' : '2px solid #e5e7eb',
      borderRadius: 10,
      padding: '14px 16px',
      cursor: 'pointer',
      background: selected ? '#f0f0ff' : '#fff',
      transition: 'all 0.15s',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}
  >
    <span style={{ fontSize: 28, lineHeight: 1 }}>{theme.emoji}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          color: selected ? '#4f46e5' : '#111827',
          marginBottom: 3,
        }}
      >
        {theme.label}
        {selected && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              background: '#6366f1',
              color: '#fff',
              borderRadius: 4,
              padding: '1px 7px',
              fontWeight: 600,
            }}
          >
            Default
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
        {theme.description}
      </div>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const SiteSettingsAdmin = (): JSX.Element => {
  const { getToken } = useAuth();

  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<SavingKey>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [uploadingOgImage, setUploadingOgImage] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-dismiss toast ────────────────────────────────────────────────────
  const showToast = useCallback((next: ToastState) => {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // ── Fetch site settings on mount ──────────────────────────────────────────
  const fetchSettings = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as Record<string, unknown>;

      setSettings({
        site_title:
          typeof raw.site_title === 'string' ? raw.site_title : '',
        meta_description:
          typeof raw.meta_description === 'string' ? raw.meta_description : '',
        og_image_url:
          typeof raw.og_image_url === 'string' ? raw.og_image_url : '',
        maintenance_mode:
          raw.maintenance_mode === true || raw.maintenance_mode === 'true',
        ai_enabled:
          raw.ai_enabled === undefined
            ? true
            : raw.ai_enabled === true || raw.ai_enabled === 'true',
        default_theme:
          typeof raw.default_theme === 'string' &&
          ['space', 'ocean', 'forest', 'ember', 'minimal'].includes(raw.default_theme as string)
            ? (raw.default_theme as ThemeName)
            : 'space',
        default_layout:
          typeof raw.default_layout === 'string' &&
          ['arc', 'dock', 'scattered', 'orbital'].includes(raw.default_layout)
            ? (raw.default_layout as SiteSettings['default_layout'])
            : 'arc',
      });
    } catch (err) {
      console.error('[SiteSettingsAdmin] fetch error:', err);
      showToast({ type: 'error', message: 'Failed to load site settings.' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  // ── Save a single key ─────────────────────────────────────────────────────
  const saveSetting = async (
    key: keyof SiteSettings,
    value: string | boolean
  ): Promise<void> => {
    setSavingKey(key);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/stats', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key, value }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      showToast({
        type: 'success',
        message: `${key.replace(/_/g, ' ')} saved.`,
      });
    } catch (err) {
      console.error(`[SiteSettingsAdmin] save ${key} error:`, err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Save failed.',
      });
    } finally {
      setSavingKey(null);
    }
  };

  // ── Local field updater ───────────────────────────────────────────────────
  const set = <K extends keyof SiteSettings>(
    key: K,
    value: SiteSettings[K]
  ): void => setSettings((prev) => ({ ...prev, [key]: value }));

  // ── OG image upload ───────────────────────────────────────────────────────
  const handleOgImageUpload = async (): Promise<void> => {
    setUploadingOgImage(true);
    try {
      const token = await getToken();
      await loadCloudinaryWidget();
      const sigData = await getSignedUploadOptions('site', token ?? '');
      window.cloudinary!.openUploadWidget(
        {
          cloudName: sigData.cloudName,
          apiKey: sigData.apiKey,
          signature: sigData.signature,
          timestamp: sigData.timestamp,
          folder: sigData.folder,
          sources: ['local', 'url'],
          maxFileSize: 5_000_000,
          resourceType: 'image',
          clientAllowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        },
        (_error, result) => {
          setUploadingOgImage(false);
          if (result?.event === 'success') {
            set('og_image_url', result.info.secure_url);
            showToast({ type: 'success', message: 'OG image uploaded.' });
          }
        }
      );
    } catch {
      setUploadingOgImage(false);
      showToast({ type: 'error', message: 'Failed to open upload widget.' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading site settings…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* ── SEO & Metadata ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🔍 SEO & Metadata</h3>
        <p className={styles.sectionHint}>
          Controls how your portfolio appears in search results and social
          media link previews.
        </p>

        <SettingCard
          saving={savingKey === 'site_title'}
          onSave={() => void saveSetting('site_title', settings.site_title)}
        >
          <Field
            label="Site Title"
            hint="Used in the browser tab and as the og:title for link previews. Keep under 60 characters."
          >
            <input
              className={styles.input}
              type="text"
              value={settings.site_title}
              onChange={(e) => set('site_title', e.target.value)}
              placeholder="e.g. Alex Johnson — Full-Stack Engineer"
              maxLength={120}
            />
            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'block' }}>
              {settings.site_title.length} / 60 recommended
            </span>
          </Field>
        </SettingCard>

        <SettingCard
          saving={savingKey === 'meta_description'}
          onSave={() =>
            void saveSetting('meta_description', settings.meta_description)
          }
        >
          <Field
            label="Meta Description"
            hint="Shown in search results below your title. Keep under 160 characters."
          >
            <textarea
              className={styles.textarea}
              rows={3}
              value={settings.meta_description}
              onChange={(e) => set('meta_description', e.target.value)}
              placeholder="e.g. Portfolio of Alex Johnson — full-stack engineer who builds things people actually enjoy using."
              maxLength={320}
              style={{ resize: 'vertical' }}
            />
            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'block' }}>
              {settings.meta_description.length} / 160 recommended
            </span>
          </Field>
        </SettingCard>

        <SettingCard
          saving={savingKey === 'og_image_url'}
          onSave={() => void saveSetting('og_image_url', settings.og_image_url)}
          saveLabel="Save OG Image"
        >
          <Field
            label="OG Image"
            hint="The image shown when someone shares your portfolio link. Recommended: 1200×630px."
          >
            <div className={styles.uploadRow} style={{ marginBottom: 10 }}>
              {settings.og_image_url && (
                <img
                  src={settings.og_image_url}
                  alt="OG image preview"
                  style={{
                    width: 180,
                    height: 95,
                    objectFit: 'cover',
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                  }}
                />
              )}
              <div className={styles.uploadActions}>
                <button
                  className={styles.uploadBtn}
                  onClick={handleOgImageUpload}
                  disabled={uploadingOgImage}
                  type="button"
                >
                  {uploadingOgImage
                    ? 'Opening…'
                    : settings.og_image_url
                    ? '🖼 Replace OG Image'
                    : '🖼 Upload OG Image'}
                </button>
                {settings.og_image_url && (
                  <button
                    className={styles.clearBtn}
                    onClick={() => set('og_image_url', '')}
                    type="button"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {settings.og_image_url && (
              <input
                className={styles.input}
                type="text"
                value={settings.og_image_url}
                onChange={(e) => set('og_image_url', e.target.value)}
                placeholder="Or paste a Cloudinary URL directly"
                style={{ fontSize: 12 }}
              />
            )}
          </Field>
        </SettingCard>
      </section>

      {/* ── Feature Flags ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🚦 Feature Flags</h3>
        <p className={styles.sectionHint}>
          Toggle features on or off for visitors. Changes take effect on the
          next page load — no redeploy required.
        </p>

        <SettingCard
          saving={savingKey === 'maintenance_mode'}
          onSave={() =>
            void saveSetting('maintenance_mode', settings.maintenance_mode)
          }
          saveLabel="Save"
        >
          <ToggleRow
            checked={settings.maintenance_mode}
            onChange={(val) => set('maintenance_mode', val)}
            label="Maintenance Mode"
            description="Hides the portfolio and shows a 'Under Maintenance' message to all visitors. The admin panel remains accessible."
          />
          {settings.maintenance_mode && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: '#fef3c7',
                borderRadius: 8,
                fontSize: 13,
                color: '#92400e',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              ⚠️ Maintenance mode is currently <strong>ON</strong>. Visitors see
              the maintenance overlay — not your portfolio.
            </div>
          )}
        </SettingCard>

        <SettingCard
          saving={savingKey === 'ai_enabled'}
          onSave={() => void saveSetting('ai_enabled', settings.ai_enabled)}
          saveLabel="Save"
        >
          <ToggleRow
            checked={settings.ai_enabled}
            onChange={(val) => set('ai_enabled', val)}
            label="AI Assistant"
            description="Shows or hides the AI chat orb in the bottom-right corner of your portfolio."
          />
          {!settings.ai_enabled && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: '#f3f4f6',
                borderRadius: 8,
                fontSize: 13,
                color: '#6b7280',
              }}
            >
              The AI assistant corner button is hidden from visitors.
            </div>
          )}
        </SettingCard>
      </section>

      {/* ── Default Layout ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🗂 Default Layout</h3>
        <p className={styles.sectionHint}>
          The navigation layout new visitors see on first load.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {LAYOUT_OPTIONS.map((layout) => (
            <ThemeCard
              key={layout.value}
              theme={layout}
              selected={settings.default_layout === layout.value}
              onClick={() => set('default_layout', layout.value)}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className={styles.saveBtn}
            onClick={() => void saveSetting('default_layout', settings.default_layout)}
            type="button"
            disabled={savingKey === 'default_layout'}
            style={{ padding: '8px 24px' }}
          >
            {savingKey === 'default_layout' ? 'Saving…' : 'Save Default Layout'}
          </button>
        </div>
      </section>

      {/* ── Default Theme ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🎨 Default Theme</h3>
        <p className={styles.sectionHint}>
          The theme new visitors see on first load. Returning visitors who have
          already switched themes keep their last-used theme.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {THEME_OPTIONS.map((theme) => (
            <ThemeCard
              key={theme.value}
              theme={theme}
              selected={settings.default_theme === theme.value}
              onClick={() => set('default_theme', theme.value)}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className={styles.saveBtn}
            onClick={() => void saveSetting('default_theme', settings.default_theme)}
            type="button"
            disabled={savingKey === 'default_theme'}
            style={{ padding: '8px 24px' }}
          >
            {savingKey === 'default_theme' ? 'Saving…' : 'Save Default Theme'}
          </button>
        </div>

        <p
          style={{
            fontSize: 12,
            color: '#9ca3af',
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          ℹ️ App.tsx reads <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>default_theme</code> from{' '}
          <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>/api/stats</code> on
          initial load and uses it to initialise the Zustand store's{' '}
          <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>activeTheme</code>.
        </p>
      </section>

      {/* ── Current values summary ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Current Values</h3>
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {(
            [
              {
                key: 'site_title',
                label: 'Site Title',
                value: settings.site_title || '—',
                mono: false,
              },
              {
                key: 'meta_description',
                label: 'Meta Description',
                value: settings.meta_description
                  ? settings.meta_description.slice(0, 80) +
                    (settings.meta_description.length > 80 ? '…' : '')
                  : '—',
                mono: false,
              },
              {
                key: 'og_image_url',
                label: 'OG Image',
                value: settings.og_image_url || '—',
                mono: true,
              },
              {
                key: 'maintenance_mode',
                label: 'Maintenance Mode',
                value: settings.maintenance_mode ? '🔴 ON' : '🟢 Off',
                mono: false,
              },
              {
                key: 'ai_enabled',
                label: 'AI Assistant',
                value: settings.ai_enabled ? '🟢 Enabled' : '🔴 Disabled',
                mono: false,
              },
              {
                key: 'default_theme',
                label: 'Default Theme',
                value:
                  THEME_OPTIONS.find((t) => t.value === settings.default_theme)
                    ?.label ?? settings.default_theme,
                mono: false,
              },
              {
                key: 'default_layout',
                label: 'Default Layout',
                value:
                  LAYOUT_OPTIONS.find((l) => l.value === settings.default_layout)
                    ?.label ?? settings.default_layout,
                mono: false,
              },
            ] as {
              key: keyof SiteSettings;
              label: string;
              value: string;
              mono: boolean;
            }[]
          ).map(({ key, label, value, mono }, idx, arr) => (
            <div
              key={key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '11px 16px',
                fontSize: 13,
                borderBottom:
                  idx < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <span style={{ color: '#6b7280', fontWeight: 500 }}>{label}</span>
              <span
                style={{
                  color: value === '—' ? '#d1d5db' : '#111827',
                  fontFamily: mono ? 'monospace' : 'inherit',
                  fontSize: mono && value !== '—' ? 11 : 13,
                  maxWidth: 340,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={value}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default SiteSettingsAdmin;