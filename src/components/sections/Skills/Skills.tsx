// src/components/sections/Skills/Skills.tsx

import { useState } from 'react';
import { useStore } from '@/store';
import type { Skill } from '@/types';
import styles from './Skills.module.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const proficiencyLabel = (p: number): string => {
  if (p <= 2) return 'Beginner';
  if (p <= 4) return 'Familiar';
  if (p <= 6) return 'Proficient';
  if (p <= 8) return 'Advanced';
  return 'Expert';
};

const proficiencyColor = (p: number): string => {
  if (p <= 3) return 'var(--prof-low)';
  if (p <= 6) return 'var(--prof-mid)';
  if (p <= 8) return 'var(--prof-high)';
  return 'var(--prof-expert)';
};

// ---------------------------------------------------------------------------
// SkillCard
// ---------------------------------------------------------------------------
type SkillCardProps = { skill: Skill; index: number };

const SkillCard = ({ skill, index }: SkillCardProps): JSX.Element => {
  const [hovered, setHovered] = useState(false);
  const pct = Math.round((skill.proficiency / 10) * 100);

  return (
    <div
      className={`${styles.skillCard} ${hovered ? styles.skillCardHovered : ''}`}
      style={{ animationDelay: `${index * 0.04}s` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Icon */}
      <div className={styles.skillIcon}>
        {skill.icon ?? skill.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className={styles.skillInfo}>
        <div className={styles.skillTop}>
          <span className={styles.skillName}>{skill.name}</span>
          <span className={styles.skillYears}>{skill.years}y</span>
        </div>

        {/* Bar */}
        <div className={styles.barTrack}>
          <div
            className={styles.barFill}
            style={{
              width: hovered ? `${pct}%` : '0%',
              background: proficiencyColor(skill.proficiency),
            }}
          />
        </div>

        <div className={styles.skillBottom}>
          <span className={styles.skillLevel}>{proficiencyLabel(skill.proficiency)}</span>
          <span className={styles.skillPct}>{pct}%</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const Skills = (): JSX.Element => {
  const skills = useStore((s) => s.skills);
  const [activeCategory, setActiveCategory] = useState<string>('All');

  if (skills.length === 0) {
    return (
      <div className={styles.skillsContainer}>
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>⚡</div>
          <p className={styles.emptyStateText}>No skills added yet.</p>
        </div>
      </div>
    );
  }

  // Group by category
  const grouped = new Map<string, Skill[]>();
  for (const skill of skills) {
    const arr = grouped.get(skill.category) ?? [];
    arr.push(skill);
    grouped.set(skill.category, arr);
  }

  const categories = ['All', ...Array.from(grouped.keys())];

  const filteredGroups: Map<string, Skill[]> =
    activeCategory === 'All'
      ? grouped
      : new Map([[activeCategory, grouped.get(activeCategory) ?? []]]);

  // Summary stats
  const totalSkills = skills.length;
  const avgProficiency = Math.round(
    skills.reduce((s, sk) => s + sk.proficiency, 0) / skills.length
  );
  const expertCount = skills.filter((s) => s.proficiency >= 9).length;

  return (
    <div className={styles.skillsContainer}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.sectionTitle}>Skills</h2>
          <p className={styles.subtitle}>Technologies &amp; tools I work with</p>
        </div>
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statNum}>{totalSkills}</span>
            <span className={styles.statLbl}>Skills</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum}>{avgProficiency}/10</span>
            <span className={styles.statLbl}>Avg level</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum}>{expertCount}</span>
            <span className={styles.statLbl}>Expert</span>
          </div>
        </div>
      </div>

      {/* ── Category filter tabs ── */}
      <div className={styles.tabs}>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`${styles.tab} ${activeCategory === cat ? styles.tabActive : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
            {cat !== 'All' && (
              <span className={styles.tabCount}>
                {grouped.get(cat)?.length ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Grouped skill cards ── */}
      <div className={styles.groups}>
        {Array.from(filteredGroups.entries()).map(([category, catSkills]) => (
          <div key={category} className={styles.group}>
            <div className={styles.groupHeader}>
              <span className={styles.groupDot} />
              <span className={styles.groupName}>{category}</span>
              <span className={styles.groupLine} />
              <span className={styles.groupCount}>{catSkills.length}</span>
            </div>
            <div className={styles.grid}>
              {catSkills
                .sort((a, b) => b.proficiency - a.proficiency)
                .map((skill, i) => (
                  <SkillCard key={skill.id} skill={skill} index={i} />
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className={styles.legend}>
        {[
          { label: 'Beginner–Familiar', color: 'var(--prof-low)' },
          { label: 'Proficient', color: 'var(--prof-mid)' },
          { label: 'Advanced', color: 'var(--prof-high)' },
          { label: 'Expert', color: 'var(--prof-expert)' },
        ].map(({ label, color }) => (
          <div key={label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: color }} />
            <span className={styles.legendLabel}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Skills;