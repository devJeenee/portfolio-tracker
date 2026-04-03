import { z } from 'zod';
import type { CodeAnalysis } from '../types/analysis.js';
import { JavaAnalyzer } from '../analyzers/code/java/java-analyzer.js';
import { glob } from '../analyzers/metrics/glob-helper.js';
import { loadConventions } from '../config/convention-loader.js';
import { calculateMaturityScore } from '../analyzers/metrics/maturity-scorer.js';

export const analyzeCodeSchema = z.object({
  path: z.string().optional().describe('Project root path (defaults to cwd)'),
});

export async function handleAnalyzeCode(args: z.infer<typeof analyzeCodeSchema>) {
  const projectPath = args.path ?? process.cwd();
  const files = await glob(projectPath);
  const conventions = await loadConventions(projectPath);
  const context = { projectPath, files, conventions };

  const analyzer = new JavaAnalyzer();
  const allOpportunities = await analyzer.analyze(context);
  allOpportunities.sort((a, b) => b.portfolioValue - a.portfolioValue);

  const maturity = calculateMaturityScore(allOpportunities);

  const analysis: CodeAnalysis = {
    opportunities: allOpportunities,
    maturity,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(analysis, null, 2),
      },
    ],
  };
}
