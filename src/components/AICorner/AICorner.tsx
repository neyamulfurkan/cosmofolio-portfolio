// src/components/AICorner/AICorner.tsx

import { useState, useRef, useEffect, useCallback } from 'react';
import type { AIMessage, SectionName } from '@/types';
import { useStore } from '@/store';
import { SECTIONS } from '@/lib/constants';
import styles from './AICorner.module.css';

// ---------------------------------------------------------------------------
// Portfolio context builder
// ---------------------------------------------------------------------------

const buildPortfolioContext = (state: ReturnType<typeof useStore.getState>): string => {
  const { identity, skills, experience, projects, education, certifications, blogPosts, labItems, achievements } = state;

  const lines: string[] = [];

  if (identity) {
    lines.push(`Owner: ${identity.name}`);
    lines.push(`Tagline: ${identity.tagline}`);
    lines.push(`Availability: ${identity.availabilityStatus} — ${identity.availabilityLabel}`);
    if (identity.titleVariants.length > 0) {
      lines.push(`Titles: ${identity.titleVariants.join(', ')}`);
    }
  }

  if (skills.length > 0) {
    const byCategory: Record<string, string[]> = {};
    for (const skill of skills) {
      if (!byCategory[skill.category]) byCategory[skill.category] = [];
      byCategory[skill.category].push(skill.name);
    }
    lines.push('Skills:');
    for (const [cat, names] of Object.entries(byCategory)) {
      lines.push(`  ${cat}: ${names.join(', ')}`);
    }
  }

  if (experience.length > 0) {
    lines.push('Experience:');
    for (const exp of experience) {
      const end = exp.endDate ? exp.endDate.slice(0, 7) : 'Present';
      lines.push(`  ${exp.role} at ${exp.company} (${exp.startDate.slice(0, 7)} – ${end})`);
    }
  }

  if (projects.length > 0) {
    const published = projects.filter((p) => p.published);
    lines.push('Projects:');
    for (const proj of published) {
      const tags = proj.tags.length > 0 ? ` [${proj.tags.join(', ')}]` : '';
      const tagline = proj.tagline ? ` — ${proj.tagline}` : '';
      lines.push(`  ${proj.title}${tagline}${tags} (id: ${proj.id})`);
      if (proj.problemText) lines.push(`    Problem: ${proj.problemText}`);
      if (proj.resultText) lines.push(`    Result: ${proj.resultText}`);
    }
  }

  if (education.length > 0) {
    lines.push('Education:');
    for (const edu of education) {
      const end = edu.endDate ? edu.endDate.slice(0, 7) : 'Present';
      lines.push(`  ${edu.degree} in ${edu.field} — ${edu.institution} (${edu.startDate.slice(0, 7)} – ${end})`);
      if (edu.description) lines.push(`    ${edu.description}`);
    }
  }

  if (certifications.length > 0) {
    lines.push('Certifications:');
    for (const cert of certifications) {
      lines.push(`  ${cert.name} by ${cert.issuer} (${cert.issuedDate.slice(0, 7)})`);
    }
  }

  if (blogPosts.length > 0) {
    const published = blogPosts.filter((p) => p.published);
    lines.push('Blog Posts:');
    for (const post of published) {
      lines.push(`  "${post.title}" [${post.category}] — ${post.excerpt}`);
    }
  }

  if (labItems.length > 0) {
    const published = labItems.filter((l) => l.published);
    lines.push('Lab / Experiments:');
    for (const item of published) {
      lines.push(`  ${item.title} — ${item.description}`);
    }
  }

  if (achievements.length > 0) {
    lines.push('Achievements:');
    for (const ach of achievements) {
      lines.push(`  ${ach.title} (${ach.type}) — ${ach.organization}, ${ach.date.slice(0, 7)}`);
      if (ach.description) lines.push(`    ${ach.description}`);
    }
  }

  if (identity?.aboutStory) {
    lines.push(`About: ${identity.aboutStory}`);
  }

  if (identity?.funFacts && identity.funFacts.length > 0) {
    lines.push(`Fun facts: ${identity.funFacts.join(' | ')}`);
  }

  if (identity?.values && identity.values.length > 0) {
    lines.push(`Values: ${identity.values.map((v) => `${v.label} — ${v.description}`).join('; ')}`);
  }

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Navigation command parser — runs only after full stream completes
// ---------------------------------------------------------------------------

const parseNavigationCommands = (
  text: string,
): { type: 'navigate'; section: SectionName } | { type: 'openProject'; id: string } | null => {
  const navigateMatch = text.match(/\[\[NAVIGATE:\s*([a-z]+)\]\]/i);
  if (navigateMatch) {
    const section = navigateMatch[1].toLowerCase() as SectionName;
    const valid = SECTIONS.some((s) => s.name === section);
    if (valid) return { type: 'navigate', section };
  }

  const projectMatch = text.match(/\[\[OPEN_PROJECT:\s*([^\]]+)\]\]/i);
  if (projectMatch) {
    return { type: 'openProject', id: projectMatch[1].trim() };
  }

  return null;
};

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

type MessageBubbleProps = {
  message: AIMessage;
};

const MessageBubble = ({ message }: MessageBubbleProps): JSX.Element => {
  const isUser = message.role === 'user';
  // Strip navigation command tokens from displayed text
  const displayText = message.content
    .replace(/\[\[NAVIGATE:\s*[a-z]+\]\]/gi, '')
    .replace(/\[\[OPEN_PROJECT:\s*[^\]]+\]\]/gi, '')
    .trim();

  return (
    <div className={isUser ? styles.userMessage : styles.assistantMessage}>
      {!isUser && (
        <span className={styles.assistantLabel}>Assistant</span>
      )}
      <p className={styles.messageText}>{displayText}</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const AICorner = (): JSX.Element => {
  const aiPanelOpen = useStore((s) => s.aiPanelOpen);
  const toggleAIPanel = useStore((s) => s.toggleAIPanel);
  const aiMessages = useStore((s) => s.aiMessages);
  const addAIMessage = useStore((s) => s.addAIMessage);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const openDetail = useStore((s) => s.openDetail);

  const [inputValue, setInputValue] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingContentRef = useRef<string>('');
  const messageIndexRef = useRef<number>(-1);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  // Focus input when panel opens
  useEffect(() => {
    if (aiPanelOpen) {
      // Small delay to let the panel animate in
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [aiPanelOpen]);

  // Cancel any in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Close panel on Escape
  useEffect(() => {
    if (!aiPanelOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') toggleAIPanel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aiPanelOpen, toggleAIPanel]);

  const handleSend = useCallback(async (): Promise<void> => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;

    setInputValue('');
    setIsStreaming(true);
    streamingContentRef.current = '';

    // Append user message
    const userMsg: AIMessage = { role: 'user', content: trimmed };
    addAIMessage(userMsg);

    // Seed an empty assistant message that we'll update as chunks arrive
    const assistantMsg: AIMessage = { role: 'assistant', content: '' };
    addAIMessage(assistantMsg);
    // The assistant message is now at the end of the array
    // We track its index so we can update it in-place via store replaces
    // Since addAIMessage appends, we rely on the store's array length after both adds
    // We'll use a different approach: accumulate in ref and replace last message

    const portfolioContext = buildPortfolioContext(useStore.getState());

    // Build the messages payload (exclude the empty assistant placeholder)
    const messagesForApi: AIMessage[] = [
      ...useStore.getState().aiMessages.slice(0, -1), // all except the empty assistant msg
    ];

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesForApi,
          portfolioContext,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // The API streams server-sent events or raw text chunks.
        // Handle both SSE format (data: ...) and raw text.
        const lines = chunk.split('\n');
        for (const line of lines) {
          let textChunk = '';

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              textChunk = parsed.choices?.[0]?.delta?.content ?? '';
            } catch {
              // Not JSON — treat as raw text
              textChunk = data;
            }
          } else if (line.trim() && !line.startsWith(':')) {
            textChunk = line;
          }

          if (textChunk) {
            streamingContentRef.current += textChunk;

            // Update the last message in the store with the accumulated content
            useStore.setState((state) => {
              const msgs = [...state.aiMessages];
              const lastIdx = msgs.length - 1;
              if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
                msgs[lastIdx] = {
                  role: 'assistant',
                  content: streamingContentRef.current,
                };
              }
              return { aiMessages: msgs };
            });
          }
        }
      }

      // Stream complete — parse for navigation commands
      const fullText = streamingContentRef.current;
      const command = parseNavigationCommands(fullText);

      if (command) {
        if (command.type === 'navigate') {
          setActiveSection(command.section);
        } else if (command.type === 'openProject') {
          openDetail({ type: 'project', id: command.id });
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User navigated away or component unmounted — not an error
        return;
      }

      console.error('AI chat error:', err);

      // Update the assistant message with an error fallback
      useStore.setState((state) => {
        const msgs = [...state.aiMessages];
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
          msgs[lastIdx] = {
            role: 'assistant',
            content: streamingContentRef.current || "Sorry, I couldn't get a response. Please try again.",
          };
        }
        return { aiMessages: msgs };
      });
    } finally {
      setIsStreaming(false);
      messageIndexRef.current = -1;
      abortControllerRef.current = null;
    }
  }, [inputValue, isStreaming, addAIMessage, setActiveSection, openDetail]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const hasMessages = aiMessages.length > 0;

  return (
    <>
      {/* Orb button */}
      <button
        className={styles.cornerButton}
        onClick={toggleAIPanel}
        aria-label={aiPanelOpen ? 'Close AI assistant' : 'Open AI assistant'}
        aria-expanded={aiPanelOpen}
      >
        <span className={styles.orbInner} aria-hidden="true">✦</span>
      </button>

      {/* Chat panel */}
      {aiPanelOpen && (
        <div
          className={styles.aiPanel}
          role="dialog"
          aria-label="AI portfolio assistant"
        >
          {/* Header */}
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Portfolio Assistant</span>
            <button
              className={styles.closeButton}
              onClick={toggleAIPanel}
              aria-label="Close AI assistant"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className={styles.messages} role="log" aria-live="polite">
            {!hasMessages && (
              <div className={styles.emptyState}>
                <p>Ask me anything about this portfolio — projects, skills, experience, or navigate to a section.</p>
              </div>
            )}
            {aiMessages.map((msg, idx) => (
              <MessageBubble key={idx} message={msg} />
            ))}
            {isStreaming && streamingContentRef.current === '' && (
              <div className={styles.typingIndicator} aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div className={styles.inputRow}>
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              placeholder={isStreaming ? 'Responding…' : 'Ask something…'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              aria-label="Message input"
              maxLength={500}
            />
            <button
              className={styles.sendButton}
              onClick={() => void handleSend()}
              disabled={isStreaming || !inputValue.trim()}
              aria-label="Send message"
            >
              {isStreaming ? (
                <span className={styles.sendSpinner} aria-hidden="true" />
              ) : (
                '→'
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AICorner;