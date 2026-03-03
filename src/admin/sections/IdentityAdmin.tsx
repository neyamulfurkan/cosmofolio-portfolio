// src/admin/sections/IdentityAdmin.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Identity, AvailabilityStatus } from '../../types';
import styles from './IdentityAdmin.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type ValueEntry = { icon: string; label: string; description: string };
type SocialEntry = { platform: string; url: string; icon: string };

type FormState = {
  name: string;
  titleVariants: string; // newline-separated in the textarea
  tagline: string;
  availabilityStatus: AvailabilityStatus;
  availabilityLabel: string;
  aboutStory: string;
  aboutPhotoUrl: string;
  resumeUrl: string;
  resumeUpdatedAt: string;
  values: ValueEntry[];
  funFacts: string[]; // one per entry
  socialLinks: SocialEntry[];
};

type ToastState = { type: 'success' | 'error'; message: string } | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const identityToForm = (identity: Identity): FormState => ({
  name: identity.name,
  titleVariants: identity.titleVariants.join('\n'),
  tagline: identity.tagline,
  availabilityStatus: identity.availabilityStatus,
  availabilityLabel: identity.availabilityLabel,
  aboutStory: identity.aboutStory,
  aboutPhotoUrl: identity.aboutPhotoUrl ?? '',
  resumeUrl: identity.resumeUrl ?? '',
  resumeUpdatedAt: identity.resumeUpdatedAt
    ? identity.resumeUpdatedAt.slice(0, 10)
    : '',
  values: identity.values.length > 0
    ? identity.values
    : [{ icon: '', label: '', description: '' }],
  funFacts: identity.funFacts.length > 0 ? identity.funFacts : [''],
  socialLinks: identity.socialLinks.length > 0
    ? identity.socialLinks
    : [{ platform: '', url: '', icon: '' }],
});

const formToPayload = (form: FormState): Omit<Identity, 'id'> => ({
  name: form.name.trim(),
  titleVariants: form.titleVariants
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
  tagline: form.tagline.trim(),
  availabilityStatus: form.availabilityStatus,
  availabilityLabel: form.availabilityLabel.trim(),
  aboutStory: form.aboutStory.trim(),
  aboutPhotoUrl: form.aboutPhotoUrl.trim() || null,
  resumeUrl: form.resumeUrl.trim() || null,
  resumeUpdatedAt: form.resumeUpdatedAt.trim() || null,
  values: form.values.filter((v) => v.label.trim()),
  funFacts: form.funFacts.map((f) => f.trim()).filter(Boolean),
  socialLinks: form.socialLinks.filter((s) => s.url.trim()),
});

// ─── Cloudinary upload widget helper ─────────────────────────────────────────

declare global {
  interface Window {
    cloudinary?: {
      openUploadWidget: (
        options: Record<string, unknown>,
        callback: (error: unknown, result: { event: string; info: { secure_url: string } }) => void
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

// ── CHANGED: unsigned upload — no signature endpoint needed ──────────────────
const getUploadOptions = (folder: string): Record<string, unknown> => ({
  cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string,
  uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string,
  folder,
});

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
    <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
      <span>{toast.message}</span>
      <button className={styles.toastClose} onClick={onDismiss}>✕</button>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  name: '',
  titleVariants: '',
  tagline: '',
  availabilityStatus: 'available',
  availabilityLabel: '',
  aboutStory: '',
  aboutPhotoUrl: '',
  resumeUrl: '',
  resumeUpdatedAt: '',
  values: [{ icon: '', label: '', description: '' }],
  funFacts: [''],
  socialLinks: [{ platform: '', url: '', icon: '' }],
};

const IdentityAdmin = (): JSX.Element => {
  const { getToken } = useAuth();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-dismiss toast after 4s ──────────────────────────────────────────
  const showToast = useCallback((next: ToastState) => {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── Fetch existing identity on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchIdentity = async (): Promise<void> => {
      try {
        const token = await getToken();
        const res = await fetch('/api/admin/identity', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 404) {
          setLoading(false);
          return;
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = (await res.json()) as Identity;
        if (!cancelled) setForm(identityToForm(data));
      } catch (err) {
        console.error('[IdentityAdmin] fetch error:', err);
        if (!cancelled) showToast({ type: 'error', message: 'Failed to load identity data.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchIdentity();
    return () => { cancelled = true; };
  }, [getToken, showToast]);

  // ── Generic field updater ─────────────────────────────────────────────────
  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── Values array handlers ─────────────────────────────────────────────────
  const addValue = (): void =>
    set('values', [...form.values, { icon: '', label: '', description: '' }]);

  const removeValue = (idx: number): void =>
    set('values', form.values.filter((_, i) => i !== idx));

  const updateValue = (idx: number, field: keyof ValueEntry, val: string): void =>
    set('values', form.values.map((v, i) => i === idx ? { ...v, [field]: val } : v));

  // ── Fun facts handlers ────────────────────────────────────────────────────
  const addFact = (): void => set('funFacts', [...form.funFacts, '']);

  const removeFact = (idx: number): void =>
    set('funFacts', form.funFacts.filter((_, i) => i !== idx));

  const updateFact = (idx: number, val: string): void =>
    set('funFacts', form.funFacts.map((f, i) => (i === idx ? val : f)));

  // ── Social links handlers ─────────────────────────────────────────────────
  const addSocial = (): void =>
    set('socialLinks', [...form.socialLinks, { platform: '', url: '', icon: '' }]);

  const removeSocial = (idx: number): void =>
    set('socialLinks', form.socialLinks.filter((_, i) => i !== idx));

  const updateSocial = (idx: number, field: keyof SocialEntry, val: string): void =>
    set('socialLinks', form.socialLinks.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  // ── Cloudinary photo upload ───────────────────────────────────────────────
  const handlePhotoUpload = async (): Promise<void> => {
    setUploadingPhoto(true);
    try {
      await loadCloudinaryWidget();
      // ── CHANGED: use unsigned options, no token/signature needed ──────────
      window.cloudinary!.openUploadWidget(
        {
          ...getUploadOptions('identity'),
          sources: ['local', 'url', 'camera'],
          cropping: true,
          croppingAspectRatio: 1,
          maxFileSize: 5_000_000,
          resourceType: 'image',
        },
        (_error, result) => {
          setUploadingPhoto(false);
          if (result?.event === 'success') {
            set('aboutPhotoUrl', result.info.secure_url);
            showToast({ type: 'success', message: 'Photo uploaded successfully.' });
          }
        }
      );
    } catch {
      setUploadingPhoto(false);
      showToast({ type: 'error', message: 'Failed to open upload widget.' });
    }
  };

  // ── Cloudinary resume upload ──────────────────────────────────────────────
  const handleResumeUpload = async (): Promise<void> => {
    setUploadingResume(true);
    try {
      await loadCloudinaryWidget();
      // ── CHANGED: use unsigned options, no token/signature needed ──────────
      window.cloudinary!.openUploadWidget(
        {
          ...getUploadOptions('identity/resume'),
          sources: ['local'],
          maxFileSize: 10_000_000,
          resourceType: 'auto',
          clientAllowedFormats: ['pdf'],
        },
        (_error, result) => {
          setUploadingResume(false);
          if (result?.event === 'success') {
            const url = result.info.secure_url.replace('/image/upload/', '/raw/upload/');
            set('resumeUrl', url);
            set('resumeUpdatedAt', new Date().toISOString().slice(0, 10));
            showToast({ type: 'success', message: 'Resume uploaded successfully.' });
          }
        }
      );
    } catch {
      setUploadingResume(false);
      showToast({ type: 'error', message: 'Failed to open upload widget.' });
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async (): Promise<void> => {
    if (!form.name.trim() || !form.tagline.trim() || !form.aboutStory.trim()) {
      showToast({ type: 'error', message: 'Name, tagline, and about story are required.' });
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      const payload = formToPayload(form);

      const res = await fetch('/api/admin/identity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const saved = (await res.json()) as Identity;
      setForm(identityToForm(saved));
      showToast({ type: 'success', message: 'Identity saved successfully.' });
    } catch (err) {
      console.error('[IdentityAdmin] save error:', err);
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <span>Loading identity data…</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* ── Basic Info ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Basic Info</h2>

        <Field label="Full Name" hint="Displayed large on the Home section">
          <input
            className={styles.input}
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Alex Johnson"
          />
        </Field>

        <Field
          label="Title Variants"
          hint="One title per line — cycles on the Home section (3–4 recommended)"
        >
          <textarea
            className={styles.textarea}
            rows={4}
            value={form.titleVariants}
            onChange={(e) => set('titleVariants', e.target.value)}
            placeholder={'Full-Stack Engineer\nUI/UX Designer\nOpen Source Contributor'}
          />
        </Field>

        <Field label="Tagline" hint="Short human sentence shown below the titles">
          <input
            className={styles.input}
            type="text"
            value={form.tagline}
            onChange={(e) => set('tagline', e.target.value)}
            placeholder="e.g. I build things people actually enjoy using."
          />
        </Field>
      </section>

      {/* ── Availability ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Availability</h2>

        <Field label="Status">
          <select
            className={styles.select}
            value={form.availabilityStatus}
            onChange={(e) =>
              set('availabilityStatus', e.target.value as AvailabilityStatus)
            }
          >
            <option value="available">🟢 Available</option>
            <option value="limited">🟡 Limited</option>
            <option value="unavailable">🔴 Unavailable</option>
          </select>
        </Field>

        <Field label="Availability Label" hint="One-line description shown next to the dot">
          <input
            className={styles.input}
            type="text"
            value={form.availabilityLabel}
            onChange={(e) => set('availabilityLabel', e.target.value)}
            placeholder="e.g. Open to freelance projects"
          />
        </Field>
      </section>

      {/* ── About ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>About</h2>

        <Field label="About Photo">
          <div className={styles.uploadRow}>
            {form.aboutPhotoUrl && (
              <img
                src={form.aboutPhotoUrl}
                alt="About photo preview"
                className={styles.photoPreview}
              />
            )}
            <div className={styles.uploadActions}>
              <button
                className={styles.uploadBtn}
                onClick={handlePhotoUpload}
                disabled={uploadingPhoto}
                type="button"
              >
                {uploadingPhoto ? 'Opening…' : form.aboutPhotoUrl ? '📷 Replace Photo' : '📷 Upload Photo'}
              </button>
              {form.aboutPhotoUrl && (
                <button
                  className={styles.clearBtn}
                  onClick={() => set('aboutPhotoUrl', '')}
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {form.aboutPhotoUrl && (
            <input
              className={`${styles.input} ${styles.inputSmall}`}
              type="text"
              value={form.aboutPhotoUrl}
              onChange={(e) => set('aboutPhotoUrl', e.target.value)}
              placeholder="Or paste a Cloudinary URL directly"
            />
          )}
        </Field>

        <Field label="About Story" hint="Displayed in the About section. Use newlines for paragraphs.">
          <textarea
            className={styles.textarea}
            rows={8}
            value={form.aboutStory}
            onChange={(e) => set('aboutStory', e.target.value)}
            placeholder="Tell visitors who you are, what you care about, and what drives your work…"
          />
        </Field>
      </section>

      {/* ── Resume ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Resume</h2>

        <Field label="Resume PDF">
          <div className={styles.uploadRow}>
            <div className={styles.uploadActions}>
              <button
                className={styles.uploadBtn}
                onClick={handleResumeUpload}
                disabled={uploadingResume}
                type="button"
              >
                {uploadingResume
                  ? 'Opening…'
                  : form.resumeUrl
                  ? '📄 Replace Resume'
                  : '📄 Upload Resume PDF'}
              </button>
              {form.resumeUrl && (
                <>
                  <a
                    href={form.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.viewLink}
                  >
                    View current {'↗'}
                  </a>
                  <button
                    className={styles.clearBtn}
                    onClick={() => { set('resumeUrl', ''); set('resumeUpdatedAt', ''); }}
                    type="button"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
          {form.resumeUrl && (
            <input
              className={`${styles.input} ${styles.inputSmall}`}
              type="text"
              value={form.resumeUrl}
              onChange={(e) => set('resumeUrl', e.target.value)}
              placeholder="Or paste a Cloudinary URL directly"
            />
          )}
        </Field>

        <Field label="Resume Last Updated" hint="Date shown in the Resume section">
          <input
            className={styles.input}
            type="date"
            value={form.resumeUpdatedAt}
            onChange={(e) => set('resumeUpdatedAt', e.target.value)}
          />
        </Field>
      </section>

      {/* ── Values ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Values</h2>
        <p className={styles.sectionHint}>
          Shown as cards in the About section. Emoji icon + short label + description.
        </p>

        {form.values.map((value, idx) => (
          <div key={idx} className={styles.arrayRow}>
            <div className={styles.arrayRowFields}>
              <input
                className={`${styles.input} ${styles.inputEmoji}`}
                type="text"
                value={value.icon}
                onChange={(e) => updateValue(idx, 'icon', e.target.value)}
                placeholder="🎯"
                maxLength={4}
              />
              <input
                className={styles.input}
                type="text"
                value={value.label}
                onChange={(e) => updateValue(idx, 'label', e.target.value)}
                placeholder="Label (e.g. Quality)"
              />
              <input
                className={`${styles.input} ${styles.inputWide}`}
                type="text"
                value={value.description}
                onChange={(e) => updateValue(idx, 'description', e.target.value)}
                placeholder="Short description"
              />
            </div>
            <button
              className={styles.removeBtn}
              onClick={() => removeValue(idx)}
              disabled={form.values.length <= 1}
              type="button"
              aria-label="Remove value"
            >
              ✕
            </button>
          </div>
        ))}

        <button className={styles.addBtn} onClick={addValue} type="button">
          + Add Value
        </button>
      </section>

      {/* ── Fun Facts ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Fun Facts</h2>
        <p className={styles.sectionHint}>
          Cycle through the About section. Short, punchy sentences work best.
        </p>

        {form.funFacts.map((fact, idx) => (
          <div key={idx} className={styles.arrayRow}>
            <input
              className={`${styles.input} ${styles.inputFlex}`}
              type="text"
              value={fact}
              onChange={(e) => updateFact(idx, e.target.value)}
              placeholder={`Fun fact ${idx + 1}`}
            />
            <button
              className={styles.removeBtn}
              onClick={() => removeFact(idx)}
              disabled={form.funFacts.length <= 1}
              type="button"
              aria-label="Remove fact"
            >
              ✕
            </button>
          </div>
        ))}

        <button className={styles.addBtn} onClick={addFact} type="button">
          + Add Fun Fact
        </button>
      </section>

      {/* ── Social Links ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Social Links</h2>
        <p className={styles.sectionHint}>
          Shown in the Contact section and Resume. Platform, URL, and emoji/icon name.
        </p>

        {form.socialLinks.map((social, idx) => (
          <div key={idx} className={styles.arrayRow}>
            <div className={styles.arrayRowFields}>
              <input
                className={styles.input}
                type="text"
                value={social.platform}
                onChange={(e) => updateSocial(idx, 'platform', e.target.value)}
                placeholder="Platform (e.g. GitHub)"
              />
              <input
                className={`${styles.input} ${styles.inputWide}`}
                type="url"
                value={social.url}
                onChange={(e) => updateSocial(idx, 'url', e.target.value)}
                placeholder="https://github.com/username"
              />
              <input
                className={`${styles.input} ${styles.inputEmoji}`}
                type="text"
                value={social.icon}
                onChange={(e) => updateSocial(idx, 'icon', e.target.value)}
                placeholder="🐙"
                maxLength={4}
              />
            </div>
            <button
              className={styles.removeBtn}
              onClick={() => removeSocial(idx)}
              disabled={form.socialLinks.length <= 1}
              type="button"
              aria-label="Remove social link"
            >
              ✕
            </button>
          </div>
        ))}

        <button className={styles.addBtn} onClick={addSocial} type="button">
          + Add Social Link
        </button>
      </section>

      {/* ── Save Bar ── */}
      <div className={styles.saveBar}>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving}
          type="button"
        >
          {saving ? 'Saving…' : 'Save Identity'}
        </button>
      </div>
    </div>
  );
};

export default IdentityAdmin;