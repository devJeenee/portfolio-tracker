import Anthropic from '@anthropic-ai/sdk';
import type { NarratorInput } from '../types/report.js';
import type { ReportLanguage } from '../types/index.js';

export async function generateNarrative(
  input: NarratorInput,
  language: ReportLanguage,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const langInstruction = language === 'ko'
    ? '한국어로 작성하세요. 면접관이 읽기 좋은 서술형으로 작성하세요.'
    : 'Write in English. Use a narrative style suitable for interview portfolios.';

  const prompt = `You are a portfolio writing assistant for software developers.
Based on the following project analysis data, write a compelling portfolio narrative.

${langInstruction}

## Project: ${input.projectName}
- Tech Stack: ${input.techStack.join(', ')}
- Period: ${input.period.firstCommit} ~ ${input.period.lastCommit} (${input.period.totalCommits} commits)
- Stats: ${input.stats.files} files, ${input.stats.components} components, ${input.stats.hooks} hooks, ${input.stats.testFiles} test files

## Development Stories:
${input.stories.map(s => `- [${s.type}] ${s.title} (${s.duration}, significance: ${s.significance})`).join('\n')}

## Code Improvement Opportunities:
${input.opportunities.slice(0, 5).map(o => `- [${o.type}] ${o.current} → ${o.suggestion} (portfolio value: ${o.portfolioValue}/10)`).join('\n')}

## Tracked Problems:
${input.problems.map(p => `- ${p.description}${p.solution ? ` → ${p.solution}` : ''}`).join('\n') || 'None'}

Write 3-4 paragraphs covering:
1. Project overview and technical decisions
2. Key challenges faced and how they were solved
3. Code quality awareness and improvement mindset
4. Growth demonstrated through the development process

Keep it concise, specific, and evidence-based. Avoid generic statements.
Use markdown formatting with headers (##).`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text ?? null;
  } catch {
    return null;
  }
}

export async function generateProblemNarrative(
  description: string,
  solution: string,
  tags: string[],
  language: ReportLanguage = 'ko',
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return language === 'ko'
      ? `문제: ${description}\n해결: ${solution}`
      : `Problem: ${description}\nSolution: ${solution}`;
  }

  const client = new Anthropic({ apiKey });

  const langInstruction = language === 'ko'
    ? '한국어로 작성하세요.'
    : 'Write in English.';

  const prompt = `Convert this problem-solution pair into a portfolio-worthy narrative (2-3 sentences).
${langInstruction}

Problem: ${description}
Solution: ${solution}
Keywords: ${tags.join(', ')}

Write it as if describing a technical challenge you overcame. Be specific and concise.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text ?? `${description} → ${solution}`;
  } catch {
    return `${description} → ${solution}`;
  }
}
