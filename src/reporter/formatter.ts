import type { ReportLanguage } from '../types/index.js';
import type { NarratorInput } from '../types/report.js';
import type { RankedOpportunity } from '../types/analysis.js';
import { getTemplate } from './templates.js';

export function formatReport(
  input: NarratorInput,
  narrative: string | null,
  rankedOpportunities: RankedOpportunity[],
  language: ReportLanguage,
): string {
  const t = getTemplate(language);
  const sections: string[] = [];

  sections.push(`# ${t.reportTitle}`);
  sections.push('');
  sections.push(`> ${t.generatedBy} | ${new Date().toISOString().split('T')[0]}`);
  sections.push('');

  // Project Summary
  sections.push(`## ${t.projectSummary}`);
  sections.push('');
  sections.push(`- **${t.techStackLabel}**: ${input.techStack.join(', ') || 'N/A'}`);
  sections.push(`- **${t.periodLabel}**: ${input.period.firstCommit.split('T')[0] ?? 'N/A'} ~ ${input.period.lastCommit.split('T')[0] ?? 'N/A'}`);
  sections.push(`- **${t.commitsLabel}**: ${input.period.totalCommits}`);
  sections.push(`- **Files**: ${input.stats.files} | **Components**: ${input.stats.components} | **Hooks**: ${input.stats.hooks} | **Tests**: ${input.stats.testFiles}`);
  sections.push('');

  // Narrative (from LLM)
  if (narrative) {
    sections.push(narrative);
    sections.push('');
  }

  // Problems Solved
  if (input.stories.length > 0) {
    sections.push(`## ${t.problemsSolved}`);
    sections.push('');
    for (const story of input.stories) {
      const icon = story.significance === 'high' ? '***' : story.significance === 'medium' ? '**' : '*';
      sections.push(`### ${icon}${story.title}${icon}`);
      sections.push('');
      sections.push(`- Type: ${story.type} | Duration: ${story.duration}`);
      sections.push(`- Files: ${story.files.slice(0, 5).join(', ')}`);
      sections.push('');
    }
  }

  // Improvement Opportunities
  if (rankedOpportunities.length > 0) {
    sections.push(`## ${t.improvementOpportunities}`);
    sections.push('');
    sections.push('| # | Type | Value | Difficulty | Expected |');
    sections.push('|---|------|-------|------------|----------|');
    for (const opp of rankedOpportunities.slice(0, 10)) {
      sections.push(
        `| ${opp.rank} | ${opp.type} | ${opp.portfolioValue}/10 | ${t.difficulty[opp.difficulty]} | ${opp.expectedNarrative.substring(0, 50)}... |`,
      );
    }
    sections.push('');
  }

  // Recommended Actions
  if (rankedOpportunities.length > 0) {
    sections.push(`## ${t.recommendedActions}`);
    sections.push('');
    const top3 = rankedOpportunities.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      sections.push(`${i + 1}. **${top3[i].title}** (${t.difficulty[top3[i].difficulty]}, ~${top3[i].estimatedFiles} files)`);
      sections.push(`   ${top3[i].expectedNarrative}`);
      sections.push('');
    }
  }

  // Problems logged manually
  if (input.problems.length > 0) {
    const solvedProblems = input.problems.filter(p => p.solution);
    if (solvedProblems.length > 0) {
      sections.push('## Tracked Problems');
      sections.push('');
      for (const problem of solvedProblems) {
        sections.push(`- **${problem.description}** → ${problem.solution}`);
        if (problem.tags.length > 0) {
          sections.push(`  Tags: ${problem.tags.join(', ')}`);
        }
      }
      sections.push('');
    }
  }

  return sections.join('\n');
}
