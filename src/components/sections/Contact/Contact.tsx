// src/components/sections/Contact/Contact.tsx

import { useState } from 'react';
import { useShallowStore } from '@/store';
import type { Identity } from '@/types';
import styles from './Contact.module.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLATFORM_ICONS: Record<string, string> = {
  github: '🐙',
  twitter: '𝕏',
  x: '𝕏',
  linkedin: '💼',
  instagram: '📸',
  youtube: '▶️',
  dribbble: '🎨',
  behance: '🅱',
  medium: '✍️',
  devto: '👾',
  hashnode: '📝',
  website: '🌐',
  email: '✉️',
  mail: '✉️',
  default: '🔗',
};

const getPlatformIcon = (platform: string): string =>
  PLATFORM_ICONS[platform.toLowerCase()] ?? PLATFORM_ICONS.default;

// ---------------------------------------------------------------------------
// Social links sub-component
// ---------------------------------------------------------------------------
type SocialLinksProps = {
  links: Identity['socialLinks'];
};

const SocialLinks = ({ links }: SocialLinksProps): JSX.Element | null => {
  if (!links.length) return null;
  return (
    <div className={styles.socialLinks}>
      {links.map((link) => ( <a
        
          key={link.platform}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.socialLink}
          aria-label={link.platform}
        >
          <span className={styles.socialIcon}>
            {link.icon || getPlatformIcon(link.platform)}
          </span>
          <span className={styles.socialLabel}>{link.platform}</span>
        </a>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const Contact = (): JSX.Element => {
  const { identity, siteSettings } = useShallowStore((s) => ({
    identity: s.identity,
    siteSettings: (s as unknown as Record<string, unknown>).siteSettings as
      | Record<string, unknown>
      | undefined,
  }));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendarUrl =
    typeof siteSettings?.calendar_url === 'string' ? siteSettings.calendar_url : null;

  const socialLinks: Identity['socialLinks'] = identity?.socialLinks ?? [];

  const validate = (): string | null => {
    if (!name.trim()) return 'Please enter your name.';
    if (!EMAIL_REGEX.test(email.trim())) return 'Please enter a valid email address.';
    if (!message.trim()) return 'Please enter a message.';
    return null;
  };

  const handleSend = async (): Promise<void> => {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Request failed');
      }
      setSubmitted(true);
    } catch (err) {
      console.error('[Contact] submit error:', err);
      setError('Something went wrong. Please try again or reach out directly via email.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Thank-you state ────────────────────────────────────────
  if (submitted) {
    return (
      <div className={styles.contactContainer}>
        <div className={styles.successState}>
          <div className={styles.successIcon}>✉️</div>
          <h2 className={styles.successHeading}>Message sent!</h2>
          <p className={styles.successBody}>
            Thanks for reaching out. I'll get back to you as soon as I can.
          </p>
          <button
            className={styles.resetButton}
            onClick={() => {
              setSubmitted(false);
              setName('');
              setEmail('');
              setMessage('');
            }}
          >
            Send another message
          </button>
        </div>
        <SocialLinks links={socialLinks} />
      </div>
    );
  }

  // ── Form state ─────────────────────────────────────────────
  return (
    <div className={styles.contactContainer}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Get in touch</h1>
        <p className={styles.subheading}>
          Have a project in mind, a question, or just want to say hi? Send a
          message below.
        </p>
      </div>

      <div className={styles.form}>
        <div className={styles.inputGroup}>
          <label htmlFor="contact-name" className={styles.label}>
            Name
          </label>
          <input
            id="contact-name"
            type="text"
            className={styles.input}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            autoComplete="name"
          />
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="contact-email" className={styles.label}>
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            className={styles.input}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            autoComplete="email"
          />
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="contact-message" className={styles.label}>
            Message
          </label>
          <textarea
            id="contact-message"
            className={styles.textarea}
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
            rows={5}
          />
        </div>

        {error && (
          <p className={styles.errorMessage} role="alert">
            {error}
          </p>
        )}

        <button
          className={styles.submitButton}
          onClick={handleSend}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <span className={styles.submittingLabel}>
              <span className={styles.spinner} aria-hidden="true" />
              Sending…
            </span>
          ) : (
            'Send message'
          )}
        </button>
      </div>

      {calendarUrl && (
        <div className={styles.calendarEmbed}>
          <p className={styles.calendarLabel}>Or, book a time directly:</p>
          <iframe
            src={calendarUrl}
            className={styles.calendarIframe}
            title="Schedule a meeting"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      )}

      <SocialLinks links={socialLinks} />
    </div>
  );
};

export default Contact;