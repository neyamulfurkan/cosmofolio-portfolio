// src/components/sections/Resume/Resume.tsx

import { useShallowStore } from '@/store';
import { formatDate } from '@/lib/utils';
import type { Experience, Education, Skill, Certification } from '@/types';
import styles from './Resume.module.css';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type SkillsByCategory = Record<string, Skill[]>;

const groupSkillsByCategory = (skills: Skill[]): SkillsByCategory => {
  return skills.reduce<SkillsByCategory>((acc, skill) => {
    if (!acc[skill.category]) acc[skill.category] = [];
    acc[skill.category].push(skill);
    return acc;
  }, {});
};

const ProficiencyDots = ({ level }: { level: number }): JSX.Element => {
  const total = 10;
  const filled = Math.round(level);
  return (
    <span className={styles.proficiencyDots} aria-label={`Proficiency ${level} out of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={i < filled ? styles.dotFilled : styles.dotEmpty}
        />
      ))}
    </span>
  );
};

const ExperienceEntry = ({ entry }: { entry: Experience }): JSX.Element => (
  <div className={styles.resumeEntry}>
    <div className={styles.entryHeader}>
      <div className={styles.entryTitleRow}>
        <span className={styles.entryTitle}>{entry.role}</span>
        <span className={styles.entryMeta}>
          {formatDate(entry.startDate, 'short')} — {formatDate(entry.endDate, 'short')}
        </span>
      </div>
      {entry.companyUrl ? (<a 
        
          href={entry.companyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.entryOrg}
        >
          {entry.company}
        </a>
      ) : (
        <span className={styles.entryOrg}>{entry.company}</span>
      )}
    </div>
    {entry.description && (
      <p className={styles.entryDescription}>{entry.description}</p>
    )}
    {entry.techUsed.length > 0 && (
      <div className={styles.techRow}>
        {entry.techUsed.map((tech) => (
          <span key={tech} className={styles.techTag}>
            {tech}
          </span>
        ))}
      </div>
    )}
  </div>
);

const EducationEntry = ({ entry }: { entry: Education }): JSX.Element => (
  <div className={styles.resumeEntry}>
    <div className={styles.entryHeader}>
      <div className={styles.entryTitleRow}>
        <span className={styles.entryTitle}>
          {entry.degree} in {entry.field}
        </span>
        <span className={styles.entryMeta}>
          {formatDate(entry.startDate, 'short')} — {formatDate(entry.endDate, 'short')}
        </span>
      </div>
      <span className={styles.entryOrg}>{entry.institution}</span>
    </div>
    {entry.description && (
      <p className={styles.entryDescription}>{entry.description}</p>
    )}
  </div>
);

const CertificationEntry = ({ cert }: { cert: Certification }): JSX.Element => (
  <div className={styles.certEntry}>
    <div className={styles.certName}>{cert.name}</div>
    <div className={styles.certMeta}>
      <span className={styles.certIssuer}>{cert.issuer}</span>
      <span className={styles.certDot}>·</span>
      <span className={styles.certDate}>{formatDate(cert.issuedDate, 'short')}</span>
      {cert.verifyUrl && (
        <>
          <span className={styles.certDot}>·</span> <a 
          
            href={cert.verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.verifyLink}
          >
            Verify ↗
          </a>
        </>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
const EmptyState = ({ label }: { label: string }): JSX.Element => (
  <p className={styles.emptyState}>No {label} entries yet.</p>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const Resume = (): JSX.Element => {
  const { identity, experience, education, skills, certifications } = useShallowStore(
    (s) => ({
      identity: s.identity,
      experience: s.experience,
      education: s.education,
      skills: s.skills,
      certifications: s.certifications,
    })
  );

  const skillsByCategory = groupSkillsByCategory(skills);
  const sortedExperience = [...experience].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
  const sortedEducation = [...education].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedCerts = [...certifications].sort((a, b) => a.sortOrder - b.sortOrder);

  const primaryTitle =
    identity?.titleVariants && identity.titleVariants.length > 0
      ? identity.titleVariants[0]
      : null;

  const emailLink = identity?.socialLinks.find(
    (l) => l.platform.toLowerCase() === 'email'
  );

  return (
    <div className={styles.resumeContainer}>
      {/* ── Download bar ── */}
      <div className={styles.downloadBar}>
        {identity?.resumeUrl ? ( <a 
            href={identity.resumeUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className={styles.downloadBtn}
          >
            ⬇ Download PDF
          </a>
        ) : (
          <span className={styles.downloadBtnDisabled}>PDF not available</span>
        )}
        {identity?.resumeUpdatedAt && (
          <span className={styles.updateDate}>
            Updated {formatDate(identity.resumeUpdatedAt, 'long')}
          </span>
        )}
      </div>

      {/* ── Document body ── */}
      <div className={styles.resumeDoc}>

        {/* Header */}
        <header className={styles.resumeHeader}>
          <h1 className={styles.resumeName}>{identity?.name ?? '—'}</h1>
          {primaryTitle && (
            <p className={styles.resumeTitle}>{primaryTitle}</p>
          )}
          <div className={styles.resumeContactRow}>
            {emailLink && (
              <a href={emailLink.url} className={styles.contactItem}>
                {emailLink.url.replace('mailto:', '')}
              </a>
            )}
            {identity?.socialLinks
              .filter((l) => l.platform.toLowerCase() !== 'email')
              .map((link) => (<a 
                
                  key={link.platform}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.contactItem}
                >
                  {link.platform}
                </a>
              ))}
          </div>
          {identity?.tagline && (
            <p className={styles.resumeTagline}>{identity.tagline}</p>
          )}
        </header>

        {/* Experience */}
        <section className={styles.resumeSection}>
          <h2 className={styles.sectionHeader}>Experience</h2>
          {sortedExperience.length > 0 ? (
            sortedExperience.map((entry) => (
              <ExperienceEntry key={entry.id} entry={entry} />
            ))
          ) : (
            <EmptyState label="experience" />
          )}
        </section>

        {/* Education */}
        <section className={styles.resumeSection}>
          <h2 className={styles.sectionHeader}>Education</h2>
          {sortedEducation.length > 0 ? (
            sortedEducation.map((entry) => (
              <EducationEntry key={entry.id} entry={entry} />
            ))
          ) : (
            <EmptyState label="education" />
          )}
        </section>

        {/* Skills */}
        <section className={styles.resumeSection}>
          <h2 className={styles.sectionHeader}>Skills</h2>
          {Object.keys(skillsByCategory).length > 0 ? (
            <div className={styles.skillsGrid}>
              {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
                <div key={category} className={styles.skillCategory}>
                  <h3 className={styles.skillCategoryLabel}>{category}</h3>
                  <div className={styles.skillList}>
                    {categorySkills
                      .sort((a, b) => b.proficiency - a.proficiency)
                      .map((skill) => (
                        <div key={skill.id} className={styles.skillItem}>
                          <div className={styles.skillNameRow}>
                            {skill.icon && (
                              <span className={styles.skillIcon}>{skill.icon}</span>
                            )}
                            <span className={styles.skillName}>{skill.name}</span>
                            <span className={styles.skillYears}>
                              {skill.years}yr{skill.years !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <ProficiencyDots level={skill.proficiency} />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="skills" />
          )}
        </section>

        {/* Certifications */}
        {sortedCerts.length > 0 && (
          <section className={styles.resumeSection}>
            <h2 className={styles.sectionHeader}>Certifications</h2>
            <div className={styles.certList}>
              {sortedCerts.map((cert) => (
                <CertificationEntry key={cert.id} cert={cert} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Resume;