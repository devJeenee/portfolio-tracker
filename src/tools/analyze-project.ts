import { z } from 'zod';
import { collectProjectInfo } from '../analyzers/metrics/collector.js';

export const analyzeProjectSchema = z.object({
  path: z.string().optional().describe('Project root path (defaults to cwd)'),
});

export async function handleAnalyzeProject(args: z.infer<typeof analyzeProjectSchema>) {
  const projectPath = args.path ?? process.cwd();
  const info = await collectProjectInfo(projectPath);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(info, null, 2),
      },
    ],
  };
}
