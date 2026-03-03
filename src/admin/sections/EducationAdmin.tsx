// src/admin/sections/EducationAdmin.tsx

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Education, Certification } from '../../types';

type ActiveTab = 'education' | 'certifications';
type ViewMode = 'list' | 'edit' | 'new';

// ─── Education form ───────────────────────────────────────────────────────────

type EducationFormState = {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  currentlyEnrolled: boolean;
  description: string;
};

const EMPTY_EDU_FORM: EducationFormState = {
  institution: '',
  degree: '',
  field: '',
  startDate: '',
  endDate: '',
  currentlyEnrolled: false,
  description: '',
};

const toEduForm = (e: Education): EducationFormState => ({
  institution: e.institution,
  degree: e.degree,
  field: e.field,
  startDate: e.startDate.slice(0, 10),
  endDate: e.endDate ? e.endDate.slice(0, 10) : '',
  currentlyEnrolled: e.endDate === null,
  description: e.description ?? '',
});

// ─── Certification form ───────────────────────────────────────────────────────

type CertFormState = {
  name: string;
  issuer: string;
  issuedDate: string;
  verifyUrl: string;
  badgeUrl: string;
};

const EMPTY_CERT_FORM: CertFormState = {
  name: '',
  issuer: '',
  issuedDate: '',
  verifyUrl: '',
  badgeUrl: '',
};

const toCertForm = (c: Certification): CertFormState => ({
  name: c.name,
  issuer: c.issuer,
  issuedDate: c.issuedDate.slice(0, 10),
  verifyUrl: c.verifyUrl ?? '',
  badgeUrl: c.badgeUrl ?? '',
});

// ─── Component ────────────────────────────────────────────────────────────────

const EducationAdmin = (): JSX.Element => {
  const { getToken } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('education');

  // Education state
  const [eduEntries, setEduEntries] = useState<Education[]>([]);
  const [eduViewMode, setEduViewMode] = useState<ViewMode>('list');
  const [eduEditingId, setEduEditingId] = useState<string | null>(null);
  const [eduForm, setEduForm] = useState<EducationFormState>(EMPTY_EDU_FORM);
  const [eduFieldErrors, setEduFieldErrors] = useState<Partial<Record<keyof EducationFormState, string>>>({});

  // Certification state
  const [certEntries, setCertEntries] = useState<Certification[]>([]);
  const [certViewMode, setCertViewMode] = useState<ViewMode>('list');
  const [certEditingId, setCertEditingId] = useState<string | null>(null);
  const [certForm, setCertForm] = useState<CertFormState>(EMPTY_CERT_FORM);
  const [certFieldErrors, setCertFieldErrors] = useState<Partial<Record<keyof CertFormState, string>>>({});

  // Shared UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/education', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch education data: ${res.status}`);
      const data: { education: Education[]; certifications: Certification[] } = await res.json();
      const sortedEdu = [...(data.education ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      const sortedCert = [...(data.certifications ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      setEduEntries(sortedEdu);
      setCertEntries(sortedCert);
    } catch (err) {
      console.error(err);
      setError('Failed to load education data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── Education helpers ──────────────────────────────────────────────────────

  const openEduNew = () => {
    setEduForm(EMPTY_EDU_FORM);
    setEduEditingId(null);
    setEduFieldErrors({});
    setError(null);
    setEduViewMode('new');
  };

  const openEduEdit = (e: Education) => {
    setEduForm(toEduForm(e));
    setEduEditingId(e.id);
    setEduFieldErrors({});
    setError(null);
    setEduViewMode('edit');
  };

  const backToEduList = () => {
    setEduViewMode('list');
    setEduEditingId(null);
    setEduForm(EMPTY_EDU_FORM);
    setEduFieldErrors({});
    setError(null);
  };

  const updateEduField = <K extends keyof EducationFormState>(
    key: K,
    value: EducationFormState[K],
  ) => {
    setEduForm(prev => ({ ...prev, [key]: value }));
    if (eduFieldErrors[key]) setEduFieldErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const validateEdu = (): boolean => {
    const errors: Partial<Record<keyof EducationFormState, string>> = {};
    if (!eduForm.institution.trim()) errors.institution = 'Institution is required.';
    if (!eduForm.degree.trim()) errors.degree = 'Degree is required.';
    if (!eduForm.field.trim()) errors.field = 'Field of study is required.';
    if (!eduForm.startDate) errors.startDate = 'Start date is required.';
    if (!eduForm.currentlyEnrolled && eduForm.endDate && eduForm.startDate) {
      if (new Date(eduForm.endDate) < new Date(eduForm.startDate)) {
        errors.endDate = 'End date cannot be before start date.';
      }
    }
    setEduFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleEduSave = async () => {
    if (!validateEdu()) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const payload = {
        type: 'education',
        institution: eduForm.institution.trim(),
        degree: eduForm.degree.trim(),
        field: eduForm.field.trim(),
        start_date: eduForm.startDate,
        end_date: eduForm.currentlyEnrolled ? null : eduForm.endDate || null,
        description: eduForm.description.trim() || null,
      };
      const isNew = eduViewMode === 'new';
      const url = '/api/admin/education';
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew ? payload : { id: eduEditingId, ...payload };
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed: ${res.status}`);
      }
      showSuccess(isNew ? 'Education entry created.' : 'Education entry updated.');
      await fetchAll();
      backToEduList();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEduDelete = async (id: string) => {
    setDeleting(id);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/education?id=${id}&type=education`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed: ${res.status}`);
      }
      showSuccess('Education entry deleted.');
      setEduEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to delete. Please try again.');
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  // ─── Certification helpers ──────────────────────────────────────────────────

  const openCertNew = () => {
    setCertForm(EMPTY_CERT_FORM);
    setCertEditingId(null);
    setCertFieldErrors({});
    setError(null);
    setCertViewMode('new');
  };

  const openCertEdit = (c: Certification) => {
    setCertForm(toCertForm(c));
    setCertEditingId(c.id);
    setCertFieldErrors({});
    setError(null);
    setCertViewMode('edit');
  };

  const backToCertList = () => {
    setCertViewMode('list');
    setCertEditingId(null);
    setCertForm(EMPTY_CERT_FORM);
    setCertFieldErrors({});
    setError(null);
  };

  const updateCertField = <K extends keyof CertFormState>(
    key: K,
    value: CertFormState[K],
  ) => {
    setCertForm(prev => ({ ...prev, [key]: value }));
    if (certFieldErrors[key]) setCertFieldErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const validateCert = (): boolean => {
    const errors: Partial<Record<keyof CertFormState, string>> = {};
    if (!certForm.name.trim()) errors.name = 'Certification name is required.';
    if (!certForm.issuer.trim()) errors.issuer = 'Issuer is required.';
    if (!certForm.issuedDate) errors.issuedDate = 'Issued date is required.';
    if (certForm.verifyUrl && !/^https?:\/\/.+/.test(certForm.verifyUrl.trim())) {
      errors.verifyUrl = 'Must be a valid URL starting with http:// or https://';
    }
    if (certForm.badgeUrl && !/^https?:\/\/.+/.test(certForm.badgeUrl.trim())) {
      errors.badgeUrl = 'Must be a valid URL starting with http:// or https://';
    }
    setCertFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCertSave = async () => {
    if (!validateCert()) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const payload = {
        type: 'certification',
        name: certForm.name.trim(),
        issuer: certForm.issuer.trim(),
        issuedDate: certForm.issuedDate,
        verifyUrl: certForm.verifyUrl.trim() || null,
        badgeUrl: certForm.badgeUrl.trim() || null,
      };
      const isNew = certViewMode === 'new';
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew ? payload : { id: certEditingId, ...payload };
      const res = await fetch('/api/admin/education', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed: ${res.status}`);
      }
      showSuccess(isNew ? 'Certification created.' : 'Certification updated.');
      await fetchAll();
      backToCertList();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCertDelete = async (id: string) => {
    setDeleting(id);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/education?id=${id}&type=certification`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed: ${res.status}`);
      }
      showSuccess('Certification deleted.');
      setCertEntries(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to delete. Please try again.');
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  // ─── Shared formatters ──────────────────────────────────────────────────────

  const formatDateRange = (startDate: string, endDate: string | null): string => {
    const start = new Date(startDate).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    if (!endDate) return `${start} — Present`;
    const end = new Date(endDate).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    return `${start} — ${end}`;
  };

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={styles.header}>
          <h1 style={styles.heading}>Education</h1>
        </div>
        <div style={styles.loadingState}>
          {[1, 2, 3].map(n => (
            <div key={n} style={styles.skeletonRow}>
              <div style={{ ...styles.skeletonLine, width: '45%' }} />
              <div style={{ ...styles.skeletonLine, width: '28%', marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Education form view ────────────────────────────────────────────────────

  if (eduViewMode !== 'list' && activeTab === 'education') {
    return (
      <div style={styles.root}>
        <div style={styles.header}>
          <div style={styles.breadcrumb}>
            <button style={styles.backLink} onClick={backToEduList}>
              ← Education
            </button>
            <span style={styles.breadcrumbSep}>/</span>
            <span style={styles.breadcrumbCurrent}>
              {eduViewMode === 'new' ? 'New Entry' : `Edit: ${eduForm.degree}`}
            </span>
          </div>
        </div>

        {error && <div style={styles.errorBanner}>{error}</div>}

        <div style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="edu-institution">
                Institution <span style={styles.required}>*</span>
              </label>
              <input
                id="edu-institution"
                style={{ ...styles.input, ...(eduFieldErrors.institution ? styles.inputError : {}) }}
                type="text"
                value={eduForm.institution}
                onChange={e => updateEduField('institution', e.target.value)}
                placeholder="MIT"
                autoComplete="off"
              />
              {eduFieldErrors.institution && (
                <span style={styles.fieldError}>{eduFieldErrors.institution}</span>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="edu-degree">
                Degree <span style={styles.required}>*</span>
              </label>
              <input
                id="edu-degree"
                style={{ ...styles.input, ...(eduFieldErrors.degree ? styles.inputError : {}) }}
                type="text"
                value={eduForm.degree}
                onChange={e => updateEduField('degree', e.target.value)}
                placeholder="Bachelor of Science"
                autoComplete="off"
              />
              {eduFieldErrors.degree && (
                <span style={styles.fieldError}>{eduFieldErrors.degree}</span>
              )}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="edu-field">
              Field of Study <span style={styles.required}>*</span>
            </label>
            <input
              id="edu-field"
              style={{ ...styles.input, ...(eduFieldErrors.field ? styles.inputError : {}) }}
              type="text"
              value={eduForm.field}
              onChange={e => updateEduField('field', e.target.value)}
              placeholder="Computer Science"
              autoComplete="off"
            />
            {eduFieldErrors.field && (
              <span style={styles.fieldError}>{eduFieldErrors.field}</span>
            )}
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="edu-start">
                Start Date <span style={styles.required}>*</span>
              </label>
              <input
                id="edu-start"
                style={{ ...styles.input, ...(eduFieldErrors.startDate ? styles.inputError : {}) }}
                type="date"
                value={eduForm.startDate}
                onChange={e => updateEduField('startDate', e.target.value)}
              />
              {eduFieldErrors.startDate && (
                <span style={styles.fieldError}>{eduFieldErrors.startDate}</span>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="edu-end">
                End Date
              </label>
              <input
                id="edu-end"
                style={{
                  ...styles.input,
                  ...(eduForm.currentlyEnrolled ? styles.inputDisabled : {}),
                  ...(eduFieldErrors.endDate ? styles.inputError : {}),
                }}
                type="date"
                value={eduForm.endDate}
                disabled={eduForm.currentlyEnrolled}
                onChange={e => updateEduField('endDate', e.target.value)}
              />
              {eduFieldErrors.endDate && (
                <span style={styles.fieldError}>{eduFieldErrors.endDate}</span>
              )}
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  style={styles.checkbox}
                  checked={eduForm.currentlyEnrolled}
                  onChange={e => {
                    updateEduField('currentlyEnrolled', e.target.checked);
                    if (e.target.checked) updateEduField('endDate', '');
                  }}
                />
                Currently enrolled
              </label>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="edu-description">
              Description
            </label>
            <textarea
              id="edu-description"
              style={styles.textarea}
              value={eduForm.description}
              onChange={e => updateEduField('description', e.target.value)}
              rows={4}
              placeholder="Relevant coursework, thesis, honours, activities..."
            />
          </div>

          <div style={styles.formActions}>
            <button style={styles.cancelBtn} onClick={backToEduList} disabled={saving}>
              Cancel
            </button>
            <button
              style={{ ...styles.saveBtn, ...(saving ? styles.saveBtnDisabled : {}) }}
              onClick={handleEduSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : eduViewMode === 'new' ? 'Create Entry' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Certification form view ────────────────────────────────────────────────

  if (certViewMode !== 'list' && activeTab === 'certifications') {
    return (
      <div style={styles.root}>
        <div style={styles.header}>
          <div style={styles.breadcrumb}>
            <button style={styles.backLink} onClick={backToCertList}>
              ← Certifications
            </button>
            <span style={styles.breadcrumbSep}>/</span>
            <span style={styles.breadcrumbCurrent}>
              {certViewMode === 'new' ? 'New Certification' : `Edit: ${certForm.name}`}
            </span>
          </div>
        </div>

        {error && <div style={styles.errorBanner}>{error}</div>}

        <div style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="cert-name">
                Certification Name <span style={styles.required}>*</span>
              </label>
              <input
                id="cert-name"
                style={{ ...styles.input, ...(certFieldErrors.name ? styles.inputError : {}) }}
                type="text"
                value={certForm.name}
                onChange={e => updateCertField('name', e.target.value)}
                placeholder="AWS Solutions Architect"
                autoComplete="off"
              />
              {certFieldErrors.name && (
                <span style={styles.fieldError}>{certFieldErrors.name}</span>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="cert-issuer">
                Issuer <span style={styles.required}>*</span>
              </label>
              <input
                id="cert-issuer"
                style={{ ...styles.input, ...(certFieldErrors.issuer ? styles.inputError : {}) }}
                type="text"
                value={certForm.issuer}
                onChange={e => updateCertField('issuer', e.target.value)}
                placeholder="Amazon Web Services"
                autoComplete="off"
              />
              {certFieldErrors.issuer && (
                <span style={styles.fieldError}>{certFieldErrors.issuer}</span>
              )}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="cert-date">
              Issued Date <span style={styles.required}>*</span>
            </label>
            <input
              id="cert-date"
              style={{ ...styles.input, ...(certFieldErrors.issuedDate ? styles.inputError : {}) }}
              type="date"
              value={certForm.issuedDate}
              onChange={e => updateCertField('issuedDate', e.target.value)}
            />
            {certFieldErrors.issuedDate && (
              <span style={styles.fieldError}>{certFieldErrors.issuedDate}</span>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="cert-verify">
              Verify URL
            </label>
            <input
              id="cert-verify"
              style={{ ...styles.input, ...(certFieldErrors.verifyUrl ? styles.inputError : {}) }}
              type="url"
              value={certForm.verifyUrl}
              onChange={e => updateCertField('verifyUrl', e.target.value)}
              placeholder="https://www.credly.com/badges/..."
              autoComplete="off"
            />
            {certFieldErrors.verifyUrl && (
              <span style={styles.fieldError}>{certFieldErrors.verifyUrl}</span>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="cert-badge">
              Badge Image URL
            </label>
            <input
              id="cert-badge"
              style={{ ...styles.input, ...(certFieldErrors.badgeUrl ? styles.inputError : {}) }}
              type="url"
              value={certForm.badgeUrl}
              onChange={e => updateCertField('badgeUrl', e.target.value)}
              placeholder="https://res.cloudinary.com/..."
              autoComplete="off"
            />
            {certFieldErrors.badgeUrl && (
              <span style={styles.fieldError}>{certFieldErrors.badgeUrl}</span>
            )}
            <span style={styles.hint}>Paste a Cloudinary URL or any direct image URL.</span>

            {certForm.badgeUrl && (
              <div style={styles.badgePreview}>
                <img
                  src={certForm.badgeUrl}
                  alt="Badge preview"
                  style={styles.badgePreviewImg}
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span style={styles.badgePreviewLabel}>Badge preview</span>
              </div>
            )}
          </div>

          <div style={styles.formActions}>
            <button style={styles.cancelBtn} onClick={backToCertList} disabled={saving}>
              Cancel
            </button>
            <button
              style={{ ...styles.saveBtn, ...(saving ? styles.saveBtnDisabled : {}) }}
              onClick={handleCertSave}
              disabled={saving}
            >
              {saving
                ? 'Saving…'
                : certViewMode === 'new'
                ? 'Create Certification'
                : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── List view ──────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h1 style={styles.heading}>Education</h1>
        <button
          style={styles.addBtn}
          onClick={activeTab === 'education' ? openEduNew : openCertNew}
        >
          {activeTab === 'education' ? '+ Add Entry' : '+ Add Certification'}
        </button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}
      {successMsg && <div style={styles.successBanner}>{successMsg}</div>}

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'education' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('education')}
        >
          Education
          <span style={styles.tabCount}>{eduEntries.length}</span>
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'certifications' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('certifications')}
        >
          Certifications
          <span style={styles.tabCount}>{certEntries.length}</span>
        </button>
      </div>

      {/* Education list */}
      {activeTab === 'education' && (
        <>
          {eduEntries.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🎓</div>
              <p style={styles.emptyText}>No education entries yet.</p>
              <button style={styles.addBtn} onClick={openEduNew}>
                Add your first entry
              </button>
            </div>
          ) : (
            <div style={styles.list}>
              {eduEntries.map(edu => (
                <div key={edu.id} style={styles.listItem}>
                  <div style={styles.listItemMain}>
                    <div style={styles.listItemTitle}>
                      <span style={styles.degree}>
                        {edu.degree} in {edu.field}
                      </span>
                      {!edu.endDate && <span style={styles.currentBadge}>Current</span>}
                    </div>
                    <div style={styles.listItemMeta}>
                      <span style={styles.institution}>{edu.institution}</span>
                      <span style={styles.dot}>·</span>
                      <span>{formatDateRange(edu.startDate, edu.endDate)}</span>
                    </div>
                  </div>
                  <div style={styles.listItemActions}>
                    <button style={styles.editBtn} onClick={() => openEduEdit(edu)}>
                      Edit
                    </button>
                    {confirmDeleteId === edu.id ? (
                      <span style={styles.confirmRow}>
                        <span style={styles.confirmText}>Delete?</span>
                        <button
                          style={styles.confirmYesBtn}
                          disabled={deleting === edu.id}
                          onClick={() => handleEduDelete(edu.id)}
                        >
                          {deleting === edu.id ? 'Deleting…' : 'Yes'}
                        </button>
                        <button
                          style={styles.confirmNoBtn}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        style={styles.deleteBtn}
                        onClick={() => setConfirmDeleteId(edu.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Certifications list */}
      {activeTab === 'certifications' && (
        <>
          {certEntries.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📜</div>
              <p style={styles.emptyText}>No certifications yet.</p>
              <button style={styles.addBtn} onClick={openCertNew}>
                Add your first certification
              </button>
            </div>
          ) : (
            <div style={styles.certGrid}>
              {certEntries.map(cert => (
                <div key={cert.id} style={styles.certCard}>
                  {cert.badgeUrl && (
                    <img
                      src={cert.badgeUrl}
                      alt={cert.name}
                      style={styles.certBadge}
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  {!cert.badgeUrl && <div style={styles.certBadgePlaceholder}>🏅</div>}
                  <div style={styles.certInfo}>
                    <div style={styles.certName}>{cert.name}</div>
                    <div style={styles.certIssuer}>{cert.issuer}</div>
                    <div style={styles.certDate}>{formatDate(cert.issuedDate)}</div>
                  </div>
                  <div style={styles.certActions}>
                    <button style={styles.editBtn} onClick={() => openCertEdit(cert)}>
                      Edit
                    </button>
                    {confirmDeleteId === cert.id ? (
                      <span style={styles.confirmRow}>
                        <span style={styles.confirmText}>Delete?</span>
                        <button
                          style={styles.confirmYesBtn}
                          disabled={deleting === cert.id}
                          onClick={() => handleCertDelete(cert.id)}
                        >
                          {deleting === cert.id ? '…' : 'Yes'}
                        </button>
                        <button
                          style={styles.confirmNoBtn}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        style={styles.deleteBtn}
                        onClick={() => setConfirmDeleteId(cert.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EducationAdmin;

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    maxWidth: 860,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    color: '#111',
    margin: 0,
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  backLink: {
    background: 'none',
    border: 'none',
    color: '#6366f1',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    padding: 0,
  },
  breadcrumbSep: {
    color: '#aaa',
    fontSize: 14,
  },
  breadcrumbCurrent: {
    fontSize: 14,
    color: '#555',
    fontWeight: 500,
  },
  addBtn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
    borderBottom: '2px solid #e5e7eb',
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -2,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 500,
    color: '#6b7280',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'color 0.15s',
  },
  tabActive: {
    color: '#6366f1',
    borderBottomColor: '#6366f1',
    fontWeight: 600,
  },
  tabCount: {
    background: '#f3f4f6',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    padding: '1px 7px',
    color: '#6b7280',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#fff',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #f0f0f0',
    gap: 16,
    flexWrap: 'wrap',
  },
  listItemMain: {
    flex: 1,
    minWidth: 0,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: '#111',
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  degree: {
    fontWeight: 600,
    color: '#111',
  },
  currentBadge: {
    background: '#d1fae5',
    color: '#065f46',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  listItemMeta: {
    fontSize: 13,
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  institution: {
    color: '#6366f1',
    fontWeight: 500,
  },
  dot: {
    color: '#ccc',
  },
  listItemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  certGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 16,
  },
  certCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    textAlign: 'center' as const,
  },
  certBadge: {
    width: 72,
    height: 72,
    objectFit: 'contain' as const,
    borderRadius: 8,
  },
  certBadgePlaceholder: {
    fontSize: 40,
    width: 72,
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f9fafb',
    borderRadius: 8,
  },
  certInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  certName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111',
  },
  certIssuer: {
    fontSize: 13,
    color: '#6b7280',
  },
  certDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  certActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  editBtn: {
    background: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    cursor: 'pointer',
  },
  deleteBtn: {
    background: 'none',
    border: '1px solid #fecaca',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 500,
    color: '#ef4444',
    cursor: 'pointer',
  },
  confirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  confirmText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: 500,
  },
  confirmYesBtn: {
    background: '#ef4444',
    border: 'none',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
  },
  confirmNoBtn: {
    background: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    cursor: 'pointer',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '60px 24px',
    border: '2px dashed #e5e7eb',
    borderRadius: 12,
    background: '#fafafa',
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    margin: 0,
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  skeletonRow: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '18px 20px',
  },
  skeletonLine: {
    height: 14,
    borderRadius: 6,
    background: '#f0f0f0',
  },
  form: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 28,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  required: {
    color: '#ef4444',
  },
  input: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 14,
    color: '#111',
    fontFamily: 'system-ui, sans-serif',
    outline: 'none',
    background: '#fff',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  inputDisabled: {
    background: '#f9fafb',
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  textarea: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 14,
    color: '#111',
    fontFamily: 'system-ui, sans-serif',
    outline: 'none',
    background: '#fff',
    resize: 'vertical' as const,
    lineHeight: 1.6,
    minHeight: 100,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
    marginTop: 6,
    fontWeight: 500,
  },
  checkbox: {
    width: 15,
    height: 15,
    accentColor: '#6366f1',
    cursor: 'pointer',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  fieldError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 2,
    fontWeight: 500,
  },
  badgePreview: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    padding: '10px 14px',
    background: '#f9fafb',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
  },
  badgePreviewImg: {
    width: 56,
    height: 56,
    objectFit: 'contain' as const,
    borderRadius: 6,
  },
  badgePreviewLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 8,
    borderTop: '1px solid #f0f0f0',
    marginTop: 4,
  },
  cancelBtn: {
    background: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '9px 20px',
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
    cursor: 'pointer',
  },
  saveBtn: {
    background: '#6366f1',
    border: 'none',
    borderRadius: 8,
    padding: '9px 24px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
  },
  saveBtnDisabled: {
    background: '#a5b4fc',
    cursor: 'not-allowed',
  },
  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#991b1b',
    fontSize: 14,
    marginBottom: 16,
  },
  successBanner: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#166534',
    fontSize: 14,
    marginBottom: 16,
  },
};