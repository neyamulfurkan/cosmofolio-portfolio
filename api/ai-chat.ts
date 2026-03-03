import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { messages, portfolioContext } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[];
    portfolioContext: string;
  };

  if (!Array.isArray(messages) || typeof portfolioContext !== 'string') {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GROQ_API_KEY is not configured' });
    return;
  }

  const systemPrompt =
    `You are a helpful assistant embedded in a developer portfolio. Your PRIMARY job is to answer questions directly and conversationally. ` +
    `Give real, detailed answers using the portfolio context below — never deflect by just telling the visitor to go look at a section themselves. ` +
    `Only include a navigation command WHEN the visitor explicitly asks to go somewhere or open something (e.g. "show me", "take me to", "open"). ` +
    `Navigation commands (append silently at end, never explain them): ` +
    `[[NAVIGATE: section_name]] for sections (home, projects, about, skills, experience, education, blog, stats, lab, achievements, contact, resume), ` +
    `[[OPEN_PROJECT: project_id]] for a specific project. ` +
    `Never say "I can navigate you to..." or "check out the X section" — just answer the question. ` +
    `Be concise, warm, and specific. If you don't know something, say so honestly. ` +
    `\n\nPortfolio context:\n${portfolioContext}`;

  try {
    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
        max_tokens: 1024,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      res.status(502).json({ error: 'AI service error' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const reader = groqResponse.body?.getReader();
    if (!reader) {
      res.status(502).json({ error: 'No response body from AI service' });
      return;
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
      // Force flush each chunk immediately
      (res as unknown as { flush?: () => void }).flush?.();
    }

    res.end();
  } catch (err) {
    console.error('ai-chat handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.end();
    }
  }
}