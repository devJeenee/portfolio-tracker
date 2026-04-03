import { z } from 'zod';
import { logProblem } from '../tracker/store.js';

export const logProblemSchema = z.object({
  description: z.string().describe('Problem description'),
  context: z.string().optional().describe('Additional context'),
  tags: z.array(z.string()).optional().default([]).describe('Tags for categorization'),
  path: z.string().optional().describe('Project root path (defaults to cwd)'),
});

export async function handleLogProblem(args: z.infer<typeof logProblemSchema>) {
  const projectPath = args.path ?? process.cwd();
  const problem = await logProblem(projectPath, args.description, args.context, args.tags);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          id: problem.id,
          logged_at: problem.loggedAt,
        }, null, 2),
      },
    ],
  };
}
