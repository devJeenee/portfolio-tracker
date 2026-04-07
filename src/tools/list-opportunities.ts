import { z } from 'zod';
import { handleAnalyzeCode, analyzeCodeSchema } from './analyze-code.js';
import { handleAnalyzeGit, analyzeGitSchema } from './analyze-git.js';
import { collectProjectInfo } from '../analyzers/metrics/collector.js';
import { scoreOpportunities } from '../analyzers/metrics/scorer.js';
import type { CodeAnalysis, GitAnalysis } from '../types/analysis.js';

export const listOpportunitiesSchema = z.object({
  path: z.string().optional().describe('Project root path (defaults to cwd)'),
  minValue: z.number().optional().default(0).describe('Minimum portfolio value (1-10)'),
  limit: z.number().optional().default(50).describe('Maximum number of results'),
});

export async function handleListOpportunities(args: z.infer<typeof listOpportunitiesSchema>) {
  const projectPath = args.path ?? process.cwd();
  const minValue = args.minValue ?? 0;
  const limit = args.limit ?? 50;

  const [codeResult, gitResult, projectInfo] = await Promise.all([
    handleAnalyzeCode({ path: projectPath }),
    handleAnalyzeGit({ path: projectPath }),
    collectProjectInfo(projectPath),
  ]);

  const codeAnalysis: CodeAnalysis = JSON.parse(codeResult.content[0].text);
  const gitAnalysis: GitAnalysis = JSON.parse(gitResult.content[0].text);

  const ranked = scoreOpportunities(
    codeAnalysis.opportunities,
    gitAnalysis.stories,
    projectInfo.stats,
  );

  const filtered = ranked.filter(o => o.portfolioValue >= minValue).slice(0, limit);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ opportunities: filtered }, null, 2),
      },
    ],
  };
}
