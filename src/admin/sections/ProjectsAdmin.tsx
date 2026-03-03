// src/admin/sections/ProjectsAdmin.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Project } from '../../types';
import styles from './ProjectsAdmin.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type TechEntry = { name: string; icon: string; reason: string };

type ProjectForm = {
  slug: string;
  title: string;
  tagline: string;
  coverImageUrl: string;
  coverVideoUrl: string;
  problemText: string;
  approachText: string;
  buildText: string;
  resultText: string;
  techStack: TechEntry[];
  liveUrl: string;
  githubUrl: string;
  tags: string; // comma-separated in form
  featured: boolean;
  sortOrder: number;
  published: boolean;
};

type ToastState = { type: 'success' | 'error'; message: string } | null;

type ViewMode = 'list' | 'edit' | 'new';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const projectToForm = (p: Project): ProjectForm => ({
  slug: p.slug,
  title: p.title,
  tagline: p.tagline,
  coverImageUrl: p.coverImageUrl ?? '',
  coverVideoUrl: p.coverVideoUrl ?? '',
  problemText: p.problemText ?? '',
  approachText: p.approachText ?? '',
  buildText: p.buildText ?? '',
  resultText: p.resultText ?? '',
  techStack: p.techStack.length > 0 ? p.techStack : [{ name: '', icon: '', reason: '' }],
  liveUrl: p.liveUrl ?? '',
  githubUrl: p.githubUrl ?? '',
  tags: p.tags.join(', '),
  featured: p.featured,
  sortOrder: p.sortOrder,
  published: p.published,
});

const EMPTY_FORM: ProjectForm = {
  slug: '',
  title: '',
  tagline: '',
  coverImageUrl: '',
  coverVideoUrl: '',
  problemText: '',
  approachText: '',
  buildText: '',
  resultText: '',
  techStack: [{ name: '', icon: '', reason: '' }],
  liveUrl: '',
  githubUrl: '',
  tags: '',
  featured: false,
  sortOrder: 0,
  published: false,
};

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const formToPayload = (form: ProjectForm): Omit<Project, 'id'> => ({
  slug: form.slug.trim() || slugify(form.title),
  title: form.title.trim(),
  tagline: form.tagline.trim(),
  coverImageUrl: form.coverImageUrl.trim() || null,
  coverVideoUrl: form.coverVideoUrl.trim() || null,
  problemText: form.problemText.trim() || null,
  approachText: form.approachText.trim() || null,
  buildText: form.buildText.trim() || null,
  resultText: form.resultText.trim() || null,
  techStack: form.techStack.filter((t) => t.name.trim()),
  liveUrl: form.liveUrl.trim() || null,
  githubUrl: form.githubUrl.trim() || null,
  tags: form.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
  featured: form.featured,
  sortOrder: form.sortOrder,
  published: form.published,
});

// ─── Cloudinary widget ────────────────────────────────────────────────────────

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
    script.onload = () => {
      setTimeout(resolve, 100);
    };
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

// ─── Confirm dialog ───────────────────────────────────────────────────────────

type ConfirmDialogProps = {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog = ({ message, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element => (
  <div className={styles.confirmOverlay}>
    <div className={styles.confirmBox}>
      <p className={styles.confirmMessage}>{message}</p>
      <div className={styles.confirmActions}>
        <button className={styles.confirmCancel} onClick={onCancel} type="button">
          Cancel
        </button>
        <button className={styles.confirmDelete} onClick={onConfirm} type="button">
          Delete
        </button>
      </div>
    </div>
  </div>
);

// ─── Project list row ─────────────────────────────────────────────────────────

type ProjectRowProps = {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublished: () => void;
};

const ProjectRow = ({ project, onEdit, onDelete, onTogglePublished }: ProjectRowProps): JSX.Element => (
  <div className={`${styles.projectRow} ${project.published ? '' : styles.projectRowDraft}`}>
    <div className={styles.projectRowLeft}>
      {project.coverImageUrl && (
        <img src={project.coverImageUrl} alt="" className={styles.projectRowThumb} />
      )}
      {!project.coverImageUrl && (
        <div className={styles.projectRowThumbPlaceholder}>🖼</div>
      )}
      <div className={styles.projectRowInfo}>
        <span className={styles.projectRowTitle}>{project.title}</span>
        <span className={styles.projectRowTagline}>{project.tagline}</span>
        <div className={styles.projectRowMeta}>
          {project.featured && (
            <span className={styles.featuredBadge}>★ Featured</span>
          )}
          <span className={`${styles.statusBadge} ${project.published ? styles.statusPublished : styles.statusDraft}`}>
            {project.published ? 'Published' : 'Draft'}
          </span>
          <span className={styles.sortOrderBadge}>#{project.sortOrder}</span>
        </div>
      </div>
    </div>
    <div className={styles.projectRowActions}>
      <button
        className={styles.actionBtn}
        onClick={onTogglePublished}
        type="button"
        title={project.published ? 'Unpublish' : 'Publish'}
      >
        {project.published ? '🔒 Unpublish' : '🚀 Publish'}
      </button>
      <button
        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
        onClick={onEdit}
        type="button"
      >
        ✏️ Edit
      </button>
      <button
        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
        onClick={onDelete}
        type="button"
      >
        🗑
      </button>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const ProjectsAdmin = (): JSX.Element => {
  const { getToken } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-dismiss toast ────────────────────────────────────────────────────
  const showToast = useCallback((next: ToastState) => {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(
    () => () => { if (toastTimer.current) clearTimeout(toastTimer.current); },
    []
  );

  // ── Fetch all projects (including unpublished) ────────────────────────────
  const fetchProjects = useCallback(async (): Promise<void> => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/projects?admin=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Project[];
      setProjects(data.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      console.error('[ProjectsAdmin] fetch error:', err);
      showToast({ type: 'error', message: 'Failed to load projects.' });
    } finally {
      setLoading(false);
    }
  }, [getToken, showToast]);

  useEffect(() => { void fetchProjects(); }, [fetchProjects]);

  // ── Form field updater ────────────────────────────────────────────────────
  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── Auto-generate slug from title ─────────────────────────────────────────
  const handleTitleChange = (title: string): void => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: prev.slug === '' || prev.slug === slugify(prev.title)
        ? slugify(title)
        : prev.slug,
    }));
  };

  // ── Tech stack handlers ───────────────────────────────────────────────────
  const addTech = (): void =>
    set('techStack', [...form.techStack, { name: '', icon: '', reason: '' }]);

  const removeTech = (idx: number): void =>
    set('techStack', form.techStack.filter((_, i) => i !== idx));

  const updateTech = (idx: number, field: keyof TechEntry, val: string): void =>
    set('techStack', form.techStack.map((t, i) => i === idx ? { ...t, [field]: val } : t));

  // ── Open edit form ────────────────────────────────────────────────────────
  const openEdit = (project: Project): void => {
    setForm(projectToForm(project));
    setEditingId(project.id);
    setViewMode('edit');
  };

  // ── Open new form ─────────────────────────────────────────────────────────
  const openNew = (): void => {
    const maxOrder = projects.length > 0
      ? Math.max(...projects.map((p) => p.sortOrder))
      : -1;
    setForm({ ...EMPTY_FORM, sortOrder: maxOrder + 1 });
    setEditingId(null);
    setViewMode('new');
  };

  // ── Back to list ──────────────────────────────────────────────────────────
  const backToList = (): void => {
    setViewMode('list');
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  // ── Cloudinary cover image upload ─────────────────────────────────────────
  const handleCoverUpload = async (): Promise<void> => {
    setUploadingCover(true);
    try {
      await loadCloudinaryWidget();
      // ── CHANGED: use unsigned options, no token/signature needed ──────────
      window.cloudinary!.openUploadWidget(
        {
          ...getUploadOptions('projects'),
          sources: ['local', 'url'],
          cropping: true,
          croppingAspectRatio: 16 / 9,
          maxFileSize: 8_000_000,
          resourceType: 'image',
        },
        (_error, result) => {
          setUploadingCover(false);
          if (result?.event === 'success') {
            set('coverImageUrl', result.info.secure_url);
            showToast({ type: 'success', message: 'Cover image uploaded.' });
          }
        }
      );
    } catch {
      setUploadingCover(false);
      showToast({ type: 'error', message: 'Failed to open upload widget.' });
    }
  };

  // ── Save (create or update) ───────────────────────────────────────────────
  const handleSave = async (): Promise<void> => {
    if (!form.title.trim()) {
      showToast({ type: 'error', message: 'Title is required.' });
      return;
    }
    if (!form.tagline.trim()) {
      showToast({ type: 'error', message: 'Tagline is required.' });
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      const payload = formToPayload(form);

      const isEditing = viewMode === 'edit' && editingId !== null;
      const url = isEditing
        ? `/api/admin/projects?id=${editingId}`
        : '/api/admin/projects';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(isEditing ? { id: editingId, ...payload } : payload),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const saved = (await res.json()) as Project;

      setProjects((prev) => {
        if (isEditing) {
          return prev
            .map((p) => (p.id === saved.id ? saved : p))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        }
        return [...prev, saved].sort((a, b) => a.sortOrder - b.sortOrder);
      });

      showToast({
        type: 'success',
        message: isEditing ? 'Project updated.' : 'Project created.',
      });
      backToList();
    } catch (err) {
      console.error('[ProjectsAdmin] save error:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Save failed.',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle published ──────────────────────────────────────────────────────
  const handleTogglePublished = async (project: Project): Promise<void> => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/projects?id=${project.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: project.id, published: !project.published }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as Project;
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      showToast({
        type: 'success',
        message: updated.published ? 'Project published.' : 'Project unpublished.',
      });
    } catch (err) {
      console.error('[ProjectsAdmin] toggle error:', err);
      showToast({ type: 'error', message: 'Failed to update publish status.' });
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deletingId) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/projects?id=${deletingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProjects((prev) => prev.filter((p) => p.id !== deletingId));
      showToast({ type: 'success', message: 'Project deleted.' });
    } catch (err) {
      console.error('[ProjectsAdmin] delete error:', err);
      showToast({ type: 'error', message: 'Failed to delete project.' });
    } finally {
      setDeletingId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: List view
  // ─────────────────────────────────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <div className={styles.container}>
        <Toast toast={toast} onDismiss={() => setToast(null)} />

        {deletingId && (
          <ConfirmDialog
            message="Delete this project? This cannot be undone."
            onConfirm={() => void handleDeleteConfirm()}
            onCancel={() => setDeletingId(null)}
          />
        )}

        <div className={styles.listHeader}>
          <p className={styles.listCount}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
            {' · '}
            {projects.filter((p) => p.published).length} published
          </p>
          <button className={styles.newBtn} onClick={openNew} type="button">
            + New Project
          </button>
        </div>

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading projects…</span>
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>🗂</span>
            <p>No projects yet. Create your first one.</p>
          </div>
        )}

        {!loading && projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            onEdit={() => openEdit(project)}
            onDelete={() => setDeletingId(project.id)}
            onTogglePublished={() => void handleTogglePublished(project)}
          />
        ))}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Edit / New form
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Back nav */}
      <div className={styles.formNav}>
        <button className={styles.backBtn} onClick={backToList} type="button">
          ← Back to Projects
        </button>
        <h2 className={styles.formTitle}>
          {viewMode === 'new' ? 'New Project' : `Editing: ${form.title || 'Untitled'}`}
        </h2>
      </div>

      {/* ── Basic Info ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Basic Info</h3>

        <Field label="Title" hint="Displayed on the project card and detail page">
          <input
            className={styles.input}
            type="text"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. Cosmofolio"
          />
        </Field>

        <Field label="Slug" hint="URL-safe identifier — auto-generated from title">
          <input
            className={styles.input}
            type="text"
            value={form.slug}
            onChange={(e) => set('slug', slugify(e.target.value))}
            placeholder="e.g. cosmofolio"
          />
        </Field>

        <Field label="Tagline" hint="One-line description shown on the card">
          <input
            className={styles.input}
            type="text"
            value={form.tagline}
            onChange={(e) => set('tagline', e.target.value)}
            placeholder="e.g. A living-world portfolio experience"
          />
        </Field>

        <div className={styles.checkRow}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={form.featured}
              onChange={(e) => set('featured', e.target.checked)}
            />
            Featured project
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={form.published}
              onChange={(e) => set('published', e.target.checked)}
            />
            Published (visible to visitors)
          </label>
        </div>

        <Field label="Sort Order" hint="Lower numbers appear first">
          <input
            className={`${styles.input} ${styles.inputNarrow}`}
            type="number"
            value={form.sortOrder}
            onChange={(e) => set('sortOrder', Number(e.target.value))}
            min={0}
          />
        </Field>
      </section>

      {/* ── Cover Media ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Cover Media</h3>

        <Field label="Cover Image" hint="Shown on the project card and as the hero in the detail page (16:9 recommended)">
          <div className={styles.uploadRow}>
            {form.coverImageUrl && (
              <img
                src={form.coverImageUrl}
                alt="Cover preview"
                className={styles.coverPreview}
              />
            )}
            <div className={styles.uploadActions}>
              <button
                className={styles.uploadBtn}
                onClick={() => void handleCoverUpload()}
                disabled={uploadingCover}
                type="button"
              >
                {uploadingCover
                  ? 'Opening…'
                  : form.coverImageUrl
                  ? '🖼 Replace Image'
                  : '🖼 Upload Image'}
              </button>
              {form.coverImageUrl && (
                <button
                  className={styles.clearBtn}
                  onClick={() => set('coverImageUrl', '')}
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <input
            className={`${styles.input} ${styles.inputSmall}`}
            type="text"
            value={form.coverImageUrl}
            onChange={(e) => set('coverImageUrl', e.target.value)}
            placeholder="Or paste a Cloudinary URL directly"
          />
        </Field>

        <Field label="Cover Video URL" hint="Optional — autoplay muted loop shown on hover over the card">
          <input
            className={styles.input}
            type="text"
            value={form.coverVideoUrl}
            onChange={(e) => set('coverVideoUrl', e.target.value)}
            placeholder="https://res.cloudinary.com/…/video/upload/…/demo.mp4"
          />
        </Field>
      </section>

      {/* ── Narrative Sections ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Narrative</h3>
        <p className={styles.sectionHint}>
          Each field maps to a section in the project detail page. Newlines are preserved.
          Plain text — no HTML.
        </p>

        <Field label="The Problem" hint="What problem were you solving?">
          <textarea
            className={styles.textarea}
            rows={4}
            value={form.problemText}
            onChange={(e) => set('problemText', e.target.value)}
            placeholder="Describe the challenge or problem this project addresses…"
          />
        </Field>

        <Field label="The Approach" hint="How did you think about solving it?">
          <textarea
            className={styles.textarea}
            rows={4}
            value={form.approachText}
            onChange={(e) => set('approachText', e.target.value)}
            placeholder="Explain your strategy and decision-making process…"
          />
        </Field>

        <Field label="The Build" hint="Technical details — what you built and how">
          <textarea
            className={styles.textarea}
            rows={5}
            value={form.buildText}
            onChange={(e) => set('buildText', e.target.value)}
            placeholder="Walk through the implementation, key decisions, and technical challenges…"
          />
        </Field>

        <Field label="The Result" hint="Outcomes, impact, and what you learned">
          <textarea
            className={styles.textarea}
            rows={4}
            value={form.resultText}
            onChange={(e) => set('resultText', e.target.value)}
            placeholder="What was the outcome? Metrics, feedback, or lessons learned…"
          />
        </Field>
      </section>

      {/* ── Tech Stack ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Tech Stack</h3>
        <p className={styles.sectionHint}>
          Each entry shows as a card in the detail page. The reason is shown on hover.
        </p>

        {form.techStack.map((tech, idx) => (
          <div key={idx} className={styles.arrayRow}>
            <div className={styles.arrayRowFields}>
              <input
                className={`${styles.input} ${styles.inputEmoji}`}
                type="text"
                value={tech.icon}
                onChange={(e) => updateTech(idx, 'icon', e.target.value)}
                placeholder="⚛️"
                maxLength={4}
              />
              <input
                className={styles.input}
                type="text"
                value={tech.name}
                onChange={(e) => updateTech(idx, 'name', e.target.value)}
                placeholder="Technology name (e.g. React)"
              />
              <input
                className={`${styles.input} ${styles.inputWide}`}
                type="text"
                value={tech.reason}
                onChange={(e) => updateTech(idx, 'reason', e.target.value)}
                placeholder="Why this tech was chosen"
              />
            </div>
            <button
              className={styles.removeBtn}
              onClick={() => removeTech(idx)}
              disabled={form.techStack.length <= 1}
              type="button"
              aria-label="Remove tech"
            >
              ✕
            </button>
          </div>
        ))}

        <button className={styles.addBtn} onClick={addTech} type="button">
          + Add Technology
        </button>
      </section>

      {/* ── Links & Tags ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Links &amp; Tags</h3>

        <Field label="Live URL" hint="Deployed project link shown as a button in the detail page">
          <input
            className={styles.input}
            type="url"
            value={form.liveUrl}
            onChange={(e) => set('liveUrl', e.target.value)}
            placeholder="https://example.com"
          />
        </Field>

        <Field label="GitHub URL" hint="Repository link shown as a button in the detail page">
          <input
            className={styles.input}
            type="url"
            value={form.githubUrl}
            onChange={(e) => set('githubUrl', e.target.value)}
            placeholder="https://github.com/username/repo"
          />
        </Field>

        <Field
          label="Tags"
          hint="Comma-separated — used for filtering on the Projects section"
        >
          <input
            className={styles.input}
            type="text"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="React, TypeScript, Vercel, Open Source"
          />
        </Field>
      </section>

      {/* ── Save Bar ── */}
      <div className={styles.saveBar}>
        <button
          className={styles.cancelBtn}
          onClick={backToList}
          type="button"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          className={styles.saveBtn}
          onClick={() => void handleSave()}
          type="button"
          disabled={saving}
        >
          {saving
            ? 'Saving…'
            : viewMode === 'new'
            ? 'Create Project'
            : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default ProjectsAdmin;