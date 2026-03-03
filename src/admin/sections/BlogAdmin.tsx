// src/admin/sections/BlogAdmin.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { BlogPost } from '../../types';
import styles from './ProjectsAdmin.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogForm = {
  slug: string;
  title: string;
  coverImageUrl: string;
  category: string;
  readingTimeMinutes: number;
  content: string;
  excerpt: string;
  published: boolean;
  tags: string;
  sortOrder: number;
};

type ToastState = { type: 'success' | 'error'; message: string } | null;
type ViewMode = 'list' | 'edit' | 'new';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const postToForm = (p: BlogPost): BlogForm => ({
  slug: p.slug,
  title: p.title,
  coverImageUrl: p.coverImageUrl ?? '',
  category: p.category,
  readingTimeMinutes: p.readingTimeMinutes,
  content: p.content,
  excerpt: p.excerpt,
  published: p.published,
  tags: p.tags.join(', '),
  sortOrder: p.sortOrder,
});

const EMPTY_FORM: BlogForm = {
  slug: '',
  title: '',
  coverImageUrl: '',
  category: '',
  readingTimeMinutes: 1,
  content: '',
  excerpt: '',
  published: false,
  tags: '',
  sortOrder: 0,
};

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const calcReadingTime = (html: string): number => {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = text ? text.split(' ').length : 0;
  return Math.max(1, Math.ceil(wordCount / 200));
};

const formToPayload = (form: BlogForm): Omit<BlogPost, 'id' | 'publishedAt'> => ({
  slug: form.slug.trim() || slugify(form.title),
  title: form.title.trim(),
  coverImageUrl: form.coverImageUrl.trim() || null,
  category: form.category.trim(),
  readingTimeMinutes: form.readingTimeMinutes,
  content: form.content,
  excerpt: form.excerpt.trim(),
  published: form.published,
  tags: form.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
  sortOrder: form.sortOrder,
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
    script.onload = () => setTimeout(resolve, 100);
    script.onerror = () => reject(new Error('Failed to load Cloudinary widget'));
    document.head.appendChild(script);
  });

const getUploadOptions = (folder: string): Record<string, unknown> => ({
  cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string,
  uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string,
  folder,
});

// ─── Rich Text Editor ─────────────────────────────────────────────────────────

type RichEditorProps = {
  value: string;
  onChange: (html: string) => void;
  readingTime: number;
};

const TOOLBAR_BUTTONS = [
  { label: 'H2', title: 'Heading 2', tag: 'h2' },
  { label: 'H3', title: 'Heading 3', tag: 'h3' },
  { label: 'H4', title: 'Heading 4', tag: 'h4' },
] as const;

const RichEditor = ({ value, onChange, readingTime }: RichEditorProps): JSX.Element => {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  // Sync value → contentEditable when switching to visual or on first mount
  useEffect(() => {
    if (mode === 'visual' && editorRef.current) {
      if (editorRef.current.innerHTML !== value) {
        isInternalUpdate.current = true;
        editorRef.current.innerHTML = value;
      }
    }
  }, [mode, value]);

  const emitChange = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCmd = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    emitChange();
  };

  const insertBlock = (tag: string) => {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, tag);
    emitChange();
  };

  const insertCodeBlock = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const selectedText = range.toString() || 'code here';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = selectedText;
    pre.appendChild(code);
    range.deleteContents();
    range.insertNode(pre);
    // Move cursor after pre
    const newRange = document.createRange();
    newRange.setStartAfter(pre);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    emitChange();
  };

  const insertLink = () => {
    const url = window.prompt('Enter URL:', 'https://');
    if (url) execCmd('createLink', url);
  };

  const insertImage = () => {
    const url = window.prompt('Enter image URL:', 'https://');
    if (url) execCmd('insertImage', url);
  };

  const insertHorizontalRule = () => {
    execCmd('insertHorizontalRule');
  };

  const insertQuote = () => {
    insertBlock('blockquote');
  };

  return (
    <div style={editorStyles.wrapper}>
      {/* Toolbar */}
      <div style={editorStyles.toolbar}>
        {/* Mode toggle */}
        <div style={editorStyles.modeToggle}>
          <button
            style={{ ...editorStyles.modeBtn, ...(mode === 'visual' ? editorStyles.modeBtnActive : {}) }}
            onClick={() => setMode('visual')}
            type="button"
            title="Visual editor"
          >
            ✏️ Visual
          </button>
          <button
            style={{ ...editorStyles.modeBtn, ...(mode === 'html' ? editorStyles.modeBtnActive : {}) }}
            onClick={() => setMode('html')}
            type="button"
            title="Edit raw HTML"
          >
            &lt;/&gt; HTML
          </button>
        </div>

        {mode === 'visual' && (
          <>
            <div style={editorStyles.divider} />

            {/* Headings */}
            {TOOLBAR_BUTTONS.map(({ label, title, tag }) => (
              <button
                key={tag}
                style={editorStyles.toolBtn}
                onMouseDown={(e) => { e.preventDefault(); insertBlock(tag); }}
                type="button"
                title={title}
              >
                {label}
              </button>
            ))}

            <div style={editorStyles.divider} />

            {/* Text formatting */}
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }} type="button" title="Bold"><strong>B</strong></button>
            <button style={{ ...editorStyles.toolBtn, fontStyle: 'italic' }} onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }} type="button" title="Italic">I</button>
            <button style={{ ...editorStyles.toolBtn, textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); execCmd('underline'); }} type="button" title="Underline">U</button>
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); execCmd('strikeThrough'); }} type="button" title="Strikethrough"><s>S</s></button>

            <div style={editorStyles.divider} />

            {/* Lists */}
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList'); }} type="button" title="Bullet list">• List</button>
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); execCmd('insertOrderedList'); }} type="button" title="Numbered list">1. List</button>

            <div style={editorStyles.divider} />

            {/* Blocks */}
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); insertBlock('p'); }} type="button" title="Paragraph">¶ P</button>
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); insertQuote(); }} type="button" title="Blockquote">" Quote</button>
            <button style={{ ...editorStyles.toolBtn, fontFamily: 'monospace' }} onMouseDown={(e) => { e.preventDefault(); insertCodeBlock(); }} type="button" title="Code block">{`</>`} Code</button>
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); insertHorizontalRule(); }} type="button" title="Horizontal rule">— HR</button>

            <div style={editorStyles.divider} />

            {/* Insert */}
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); insertLink(); }} type="button" title="Insert link">🔗 Link</button>
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); insertImage(); }} type="button" title="Insert image">🖼 Img</button>

            <div style={editorStyles.divider} />

            {/* Undo/Redo */}
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); execCmd('undo'); }} type="button" title="Undo">↩ Undo</button>
            <button style={editorStyles.toolBtn} onMouseDown={(e) => { e.preventDefault(); execCmd('redo'); }} type="button" title="Redo">↪ Redo</button>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={editorStyles.readingTime}>⏱ {readingTime} min read</span>
        </div>
      </div>

      {/* Visual editor */}
      {mode === 'visual' && (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          style={editorStyles.visual}
          onInput={emitChange}
          onBlur={emitChange}
          data-placeholder="Start writing your post… Select text to format it, or use the toolbar above."
        />
      )}

      {/* HTML editor */}
      {mode === 'html' && (
        <textarea
          style={editorStyles.html}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={'<p>Start writing your post here…</p>\n\n<h2>Section heading</h2>\n<p>Body text.</p>\n\n<pre><code class="language-ts">const hello = \'world\';</code></pre>'}
        />
      )}

      {/* Preview strip */}
      <details style={editorStyles.previewDetails}>
        <summary style={editorStyles.previewSummary}>👁 Preview rendered output</summary>
        <div
          style={editorStyles.preview}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </details>
    </div>
  );
};

// ─── Rich editor inline styles ────────────────────────────────────────────────

const editorStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    border: '1px solid #d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#fff',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
    padding: '8px 10px',
    borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
  },
  modeToggle: {
    display: 'flex',
    background: '#e5e7eb',
    borderRadius: 6,
    overflow: 'hidden',
  },
  modeBtn: {
    background: 'none',
    border: 'none',
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 500,
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  modeBtnActive: {
    background: '#fff',
    color: '#111',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderRadius: 6,
  },
  divider: {
    width: 1,
    height: 20,
    background: '#e5e7eb',
    margin: '0 4px',
    flexShrink: 0,
  },
  toolBtn: {
    background: 'none',
    border: 'none',
    borderRadius: 5,
    padding: '4px 8px',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.1s',
  },
  readingTime: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  visual: {
    minHeight: 420,
    padding: '20px 24px',
    outline: 'none',
    fontSize: 15,
    lineHeight: 1.75,
    color: '#111',
    fontFamily: 'Georgia, serif',
    overflowY: 'auto' as const,
  },
  html: {
    width: '100%',
    minHeight: 420,
    padding: '16px 20px',
    border: 'none',
    outline: 'none',
    fontSize: 13,
    lineHeight: 1.7,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    color: '#1e3a5f',
    background: '#f8faff',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  previewDetails: {
    borderTop: '1px solid #e5e7eb',
  },
  previewSummary: {
    padding: '8px 16px',
    fontSize: 12,
    color: '#6b7280',
    cursor: 'pointer',
    background: '#f9fafb',
    userSelect: 'none' as const,
  },
  preview: {
    padding: '20px 24px',
    fontSize: 15,
    lineHeight: 1.75,
    color: '#111',
    fontFamily: 'Georgia, serif',
    borderTop: '1px solid #f0f0f0',
  },
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
      <button className={styles.toastClose} onClick={onDismiss} type="button">✕</button>
    </div>
  );
};

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
        <button className={styles.confirmCancel} onClick={onCancel} type="button">Cancel</button>
        <button className={styles.confirmDelete} onClick={onConfirm} type="button">Delete</button>
      </div>
    </div>
  </div>
);

type PostRowProps = {
  post: BlogPost;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublished: () => void;
};

const PostRow = ({ post, onEdit, onDelete, onTogglePublished }: PostRowProps): JSX.Element => (
  <div className={`${styles.projectRow} ${post.published ? '' : styles.projectRowDraft}`}>
    <div className={styles.projectRowLeft}>
      {post.coverImageUrl ? (
        <img src={post.coverImageUrl} alt="" className={styles.projectRowThumb} />
      ) : (
        <div className={styles.projectRowThumbPlaceholder}>✍️</div>
      )}
      <div className={styles.projectRowInfo}>
        <span className={styles.projectRowTitle}>{post.title}</span>
        <span className={styles.projectRowTagline}>{post.excerpt}</span>
        <div className={styles.projectRowMeta}>
          <span className={styles.sortOrderBadge}>{post.category}</span>
          <span className={styles.sortOrderBadge}>{post.readingTimeMinutes} min read</span>
          <span className={`${styles.statusBadge} ${post.published ? styles.statusPublished : styles.statusDraft}`}>
            {post.published ? 'Published' : 'Draft'}
          </span>
          {post.publishedAt && (
            <span className={styles.sortOrderBadge}>
              {new Date(post.publishedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
    <div className={styles.projectRowActions}>
      <button className={styles.actionBtn} onClick={onTogglePublished} type="button" title={post.published ? 'Unpublish' : 'Publish'}>
        {post.published ? '🔒 Unpublish' : '🚀 Publish'}
      </button>
      <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={onEdit} type="button">
        ✏️ Edit
      </button>
      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={onDelete} type="button">
        🗑
      </button>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const BlogAdmin = (): JSX.Element => {
  const { getToken } = useAuth();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const allCategories = Array.from(new Set(posts.map((p) => p.category).filter(Boolean)));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: ToastState) => {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const fetchPosts = useCallback(async (): Promise<void> => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/blog?admin=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BlogPost[];
      setPosts(
        data.sort((a, b) => {
          if (a.published && b.published) return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
          if (a.published) return -1;
          if (b.published) return 1;
          return a.sortOrder - b.sortOrder;
        })
      );
    } catch (err) {
      console.error('[BlogAdmin] fetch error:', err);
      showToast({ type: 'error', message: 'Failed to load blog posts.' });
    } finally {
      setLoading(false);
    }
  }, [getToken, showToast]);

  useEffect(() => { void fetchPosts(); }, [fetchPosts]);

  const set = <K extends keyof BlogForm>(key: K, value: BlogForm[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleTitleChange = (title: string): void => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: prev.slug === '' || prev.slug === slugify(prev.title) ? slugify(title) : prev.slug,
    }));
  };

  const handleContentChange = (content: string): void => {
    setForm((prev) => ({
      ...prev,
      content,
      readingTimeMinutes: calcReadingTime(content),
    }));
  };

  const openEdit = (post: BlogPost): void => {
    setForm(postToForm(post));
    setEditingId(post.id);
    setViewMode('edit');
  };

  const openNew = (): void => {
    const maxOrder = posts.length > 0 ? Math.max(...posts.map((p) => p.sortOrder)) : -1;
    setForm({ ...EMPTY_FORM, sortOrder: maxOrder + 1 });
    setEditingId(null);
    setViewMode('new');
  };

  const backToList = (): void => {
    setViewMode('list');
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleCoverUpload = async (): Promise<void> => {
    setUploadingCover(true);
    try {
      await loadCloudinaryWidget();
      window.cloudinary!.openUploadWidget(
        {
          ...getUploadOptions('blog'),
          sources: ['local', 'url'],
          cropping: true,
          croppingAspectRatio: 2 / 1,
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

  const handleSave = async (): Promise<void> => {
    if (!form.title.trim()) { showToast({ type: 'error', message: 'Title is required.' }); return; }
    if (!form.category.trim()) { showToast({ type: 'error', message: 'Category is required.' }); return; }
    if (!form.excerpt.trim()) { showToast({ type: 'error', message: 'Excerpt is required.' }); return; }
    if (!form.content.trim()) { showToast({ type: 'error', message: 'Content is required.' }); return; }

    setSaving(true);
    try {
      const token = await getToken();
      const payload = formToPayload(form);
      const isEditing = viewMode === 'edit' && editingId !== null;
      const url = isEditing ? `/api/admin/blog?id=${editingId}` : '/api/admin/blog';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(isEditing ? { id: editingId, ...payload } : payload),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const saved = (await res.json()) as BlogPost;
      setPosts((prev) => {
        if (isEditing) {
          return prev
            .map((p) => (p.id === saved.id ? saved : p))
            .sort((a, b) => {
              if (a.published && b.published) return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
              if (a.published) return -1;
              if (b.published) return 1;
              return a.sortOrder - b.sortOrder;
            });
        }
        return [saved, ...prev];
      });
      showToast({ type: 'success', message: isEditing ? 'Post updated.' : 'Post created.' });
      backToList();
    } catch (err) {
      console.error('[BlogAdmin] save error:', err);
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublished = async (post: BlogPost): Promise<void> => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/blog?id=${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: post.id, published: !post.published }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as BlogPost;
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast({ type: 'success', message: updated.published ? 'Post published.' : 'Post unpublished.' });
    } catch (err) {
      console.error('[BlogAdmin] toggle error:', err);
      showToast({ type: 'error', message: 'Failed to update publish status.' });
    }
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deletingId) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/blog?id=${deletingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deletingId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPosts((prev) => prev.filter((p) => p.id !== deletingId));
      showToast({ type: 'success', message: 'Post deleted.' });
    } catch (err) {
      console.error('[BlogAdmin] delete error:', err);
      showToast({ type: 'error', message: 'Failed to delete post.' });
    } finally {
      setDeletingId(null);
    }
  };

  // ── List view ─────────────────────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <div className={styles.container}>
        <Toast toast={toast} onDismiss={() => setToast(null)} />

        {deletingId && (
          <ConfirmDialog
            message="Delete this post? This cannot be undone."
            onConfirm={() => void handleDeleteConfirm()}
            onCancel={() => setDeletingId(null)}
          />
        )}

        <div className={styles.listHeader}>
          <p className={styles.listCount}>
            {posts.length} post{posts.length !== 1 ? 's' : ''}
            {' · '}
            {posts.filter((p) => p.published).length} published
          </p>
          <button className={styles.newBtn} onClick={openNew} type="button">
            + New Post
          </button>
        </div>

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading posts…</span>
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>✍️</span>
            <p>No posts yet. Write your first one.</p>
          </div>
        )}

        {!loading && posts.map((post) => (
          <PostRow
            key={post.id}
            post={post}
            onEdit={() => openEdit(post)}
            onDelete={() => setDeletingId(post.id)}
            onTogglePublished={() => void handleTogglePublished(post)}
          />
        ))}
      </div>
    );
  }

  // ── Edit / New form ───────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <datalist id="blog-categories">
        {allCategories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className={styles.formNav}>
        <button className={styles.backBtn} onClick={backToList} type="button">
          ← Back to Posts
        </button>
        <h2 className={styles.formTitle}>
          {viewMode === 'new' ? 'New Post' : `Editing: ${form.title || 'Untitled'}`}
        </h2>
      </div>

      {/* ── Basic Info ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Basic Info</h3>

        <Field label="Title" hint="Shown on the blog card and as the detail page heading">
          <input
            className={styles.input}
            type="text"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. Building a Living-World Portfolio"
          />
        </Field>

        <Field label="Slug" hint="URL-safe identifier — auto-generated from title">
          <input
            className={styles.input}
            type="text"
            value={form.slug}
            onChange={(e) => set('slug', slugify(e.target.value))}
            placeholder="e.g. building-a-living-world-portfolio"
          />
        </Field>

        <Field label="Category" hint="Used for the category filter on the Blog section">
          <input
            className={styles.input}
            type="text"
            list="blog-categories"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="e.g. Engineering, Design, Career"
          />
        </Field>

        <Field label="Excerpt" hint="Short preview shown on the blog card — 1–2 sentences">
          <textarea
            className={styles.textarea}
            rows={3}
            value={form.excerpt}
            onChange={(e) => set('excerpt', e.target.value)}
            placeholder="A brief summary of what this post covers…"
          />
        </Field>

        <Field label="Tags" hint="Comma-separated — shown as pills on the card">
          <input
            className={styles.input}
            type="text"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="React, CSS, Portfolio, Animation"
          />
        </Field>

        <div className={styles.checkRow}>
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

        <div className={styles.inlineRow}>
          <Field label="Sort Order" hint="For drafts — lower appears first">
            <input
              className={`${styles.input} ${styles.inputNarrow}`}
              type="number"
              value={form.sortOrder}
              onChange={(e) => set('sortOrder', Number(e.target.value))}
              min={0}
            />
          </Field>

          <Field label="Reading Time (min)" hint="Auto-calculated from content">
            <input
              className={`${styles.input} ${styles.inputNarrow}`}
              type="number"
              value={form.readingTimeMinutes}
              onChange={(e) => set('readingTimeMinutes', Math.max(1, Number(e.target.value)))}
              min={1}
            />
          </Field>
        </div>
      </section>

      {/* ── Cover Image ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Cover Image</h3>

        <Field label="Cover Image" hint="Shown on the blog card and as the hero in the detail page (2:1 ratio recommended)">
          <div className={styles.uploadRow}>
            {form.coverImageUrl && (
              <img src={form.coverImageUrl} alt="Cover preview" className={styles.coverPreview} />
            )}
            <div className={styles.uploadActions}>
              <button
                className={styles.uploadBtn}
                onClick={() => void handleCoverUpload()}
                disabled={uploadingCover}
                type="button"
              >
                {uploadingCover ? 'Opening…' : form.coverImageUrl ? '🖼 Replace Image' : '🖼 Upload Image'}
              </button>
              {form.coverImageUrl && (
                <button className={styles.clearBtn} onClick={() => set('coverImageUrl', '')} type="button">
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
      </section>

      {/* ── Content ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Content</h3>
        <p className={styles.sectionHint}>
          Use the visual editor to write naturally — bold, headings, lists, code blocks, quotes and links all supported.
          Switch to HTML mode anytime to edit raw markup. Reading time updates automatically.
        </p>

        <RichEditor
          value={form.content}
          onChange={handleContentChange}
          readingTime={form.readingTimeMinutes}
        />
      </section>

      {/* ── Save Bar ── */}
      <div className={styles.saveBar}>
        <button className={styles.cancelBtn} onClick={backToList} type="button" disabled={saving}>
          Cancel
        </button>
        <button
          className={styles.saveBtn}
          onClick={() => void handleSave()}
          type="button"
          disabled={saving}
        >
          {saving ? 'Saving…' : viewMode === 'new' ? 'Create Post' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default BlogAdmin;