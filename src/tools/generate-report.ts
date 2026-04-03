import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { collectProjectInfo } from '../analyzers/metrics/collector.js';
import { handleAnalyzeGit, analyzeGitSchema } from './analyze-git.js';
import { handleAnalyzeCode, analyzeCodeSchema } from './analyze-code.js';
import { scoreOpportunities } from '../analyzers/metrics/scorer.js';
import { loadProblems } from '../tracker/store.js';
import { generateNarrative } from '../reporter/narrator.js';
import { formatReport } from '../reporter/formatter.js';
import type { NarratorInput } from '../types/report.js';
import type { GitAnalysis, CodeAnalysis } from '../types/analysis.js';

export const generateReportSchema = z.object({
  path: z.string().optional().describe('Project root path (defaults to cwd)'),
  language: z.enum(['ko', 'en']).optional().default('ko').describe('Report language'),
  sections: z.array(z.string()).optional().describe('Sections to include'),
});

export async function handleGenerateReport(args: z.infer<typeof generateReportSchema>) {
  const projectPath = args.path ?? process.cwd();
  const language = args.language ?? 'ko';

  // Collect all data in parallel
  const [projectInfo, gitResult, codeResult, problems] = await Promise.all([
    collectProjectInfo(projectPath),
    handleAnalyzeGit({ path: projectPath }),
    handleAnalyzeCode({ path: projectPath }),
    loadProblems(projectPath),
  ]);

  const gitAnalysis: GitAnalysis = JSON.parse(gitResult.content[0].text);
  const codeAnalysis: CodeAnalysis = JSON.parse(codeResult.content[0].text);

  const rankedOpportunities = scoreOpportunities(
    codeAnalysis.opportunities,
    gitAnalysis.stories,
    projectInfo.stats,
  );

  const narratorInput: NarratorInput = {
    projectName: projectInfo.name,
    techStack: projectInfo.techStack,
    period: projectInfo.period,
    stories: gitAnalysis.stories.map(s => ({
      type: s.type,
      title: s.title,
      duration: s.duration,
      significance: s.significance,
      files: s.files,
    })),
    opportunities: codeAnalysis.opportunities.slice(0, 10).map(o => ({
      type: o.type,
      severity: o.severity,
      current: o.current,
      suggestion: o.suggestion,
      portfolioValue: o.portfolioValue,
      keywords: o.keywords,
    })),
    problems: problems.map(p => ({
      description: p.description,
      solution: p.solution,
      tags: p.tags,
    })),
    stats: projectInfo.stats,
  };

  // Generate LLM narrative (may be null if no API key)
  const narrative = await generateNarrative(narratorInput, language);

  // Format the report
  const report = formatReport(narratorInput, narrative, rankedOpportunities, language);

  // Save report
  const reportsDir = join(projectPath, '.portfolio', 'reports');
  await mkdir(reportsDir, { recursive: true });
  const filename = `report_${new Date().toISOString().split('T')[0]}.md`;
  const savedTo = join(reportsDir, filename);
  await writeFile(savedTo, report, 'utf-8');

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ report, savedTo }, null, 2),
      },
    ],
  };
}
