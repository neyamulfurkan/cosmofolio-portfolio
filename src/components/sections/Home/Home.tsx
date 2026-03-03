// src/components/sections/Home/Home.tsx

import { useShallowStore } from '@/store';
import type { AvailabilityStatus } from '@/types';
import styles from './Home.module.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DOT_CLASS: Record<AvailabilityStatus, string> = {
  available: styles.availAvailable,
  limited: styles.availLimited,
  unavailable: styles.availUnavailable,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const Home = (): JSX.Element => {
  const { identity, setActiveSection } = useShallowStore((s) => ({
    identity: s.identity,
    setActiveSection: s.setActiveSection,
  }));

  // ── Loading / empty state ─────────────────────────────────────────────────
  if (!identity) {
    return (
      <div className={styles.homeContainer}>
        <div className={styles.contentWrapper}>
          <div className={styles.skeletonName} aria-hidden="true" />
          <div className={styles.skeletonLine} aria-hidden="true" />
          <div className={styles.skeletonLineShort} aria-hidden="true" />
        </div>
      </div>
    );
  }

  const {
    name,
    titleVariants,
    tagline,
    availabilityStatus,
    availabilityLabel,
  } = identity;

  const titles = titleVariants.length > 0 ? titleVariants.slice(0, 4) : ['Developer'];

  const cycleDuration = 12;
  const itemDuration = cycleDuration;
  const itemDelay = (index: number): string =>
    `${((index * cycleDuration) / titles.length).toFixed(2)}s`;

  return (
    <div className={styles.homeContainer}>
      {/* ── Decorative accent bars (modern design element) ── */}
      <div className={styles.accentBars} aria-hidden="true">
        <div className={styles.accentBar1} />
        <div className={styles.accentBar2} />
      </div>

      {/* ── Main content wrapper (vertically centered) ── */}
      <div className={styles.contentWrapper}>
        {/* ── Owner name — staggered letter assembly ── */}
        <div className={styles.nameSection}>
          <h1 className={styles.nameDisplay} aria-label={name}>
            {name.split('').map((char, i) => (
              <span
                key={i}
                className={styles.nameLetter}
                style={{ animationDelay: `${(i * 0.05).toFixed(2)}s` }}
                aria-hidden="true"
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </h1>

          {/* ── Cycling subtitle with enhanced visibility ── */}
          <div
            className={styles.subtitleCycle}
            aria-label={titles[0]}
            role="text"
          >
            {titles.map((title, i) => (
              <span
                key={title + i}
                className={styles.subtitleItem}
                style={{
                  animationDuration: `${itemDuration}s`,
                  animationDelay: itemDelay(i),
                }}
                aria-hidden={i !== 0}
              >
                {title}
              </span>
            ))}
          </div>
        </div>

        {/* ── Tagline with better spacing ── */}
        {tagline && (
          <p className={styles.tagline}>{tagline}</p>
        )}

        {/* ── Availability card (modern, prominent) ── */}
        <div className={`${styles.availabilityCard} ${styles[`avail${availabilityStatus.charAt(0).toUpperCase() + availabilityStatus.slice(1)}`]}`}>
          <div className={styles.availPulse} aria-hidden="true" />
          <div className={styles.availContent}>
            <div className={styles.availDot} />
            <div>
              <div className={styles.availStatus}>{availabilityStatus}</div>
              <div className={styles.availLabel}>{availabilityLabel}</div>
            </div>
          </div>
        </div>

        {/* ── CTA buttons (modern, larger, more prominent) ── */}
        <div className={styles.ctaRow}>
          <button
            type="button"
            className={styles.ctaPrimary}
            onClick={() => setActiveSection('contact')}
          >
            <span className={styles.ctaIcon}>✨</span>
            Get in touch
          </button>
          <button
            type="button"
            className={styles.ctaSecondary}
            onClick={() => setActiveSection('projects')}
          >
            <span className={styles.ctaIcon}>→</span>
            View projects
          </button>
        </div>

        {/* ── Social proof / quick stats (optional, modern) ── */}
        <div className={styles.quickStatsRow} aria-hidden="true">
          <div className={styles.quickStat}>
            <div className={styles.statNumber}>10+</div>
            <div className={styles.statLabel}>Projects</div>
          </div>
          <div className={styles.quickStat}>
            <div className={styles.statNumber}>5+</div>
            <div className={styles.statLabel}>Years</div>
          </div>
          <div className={styles.quickStat}>
            <div className={styles.statNumber}>∞</div>
            <div className={styles.statLabel}>Ideas</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;