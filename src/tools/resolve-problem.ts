import { z } from 'zod';
import { resolveProblem } from '../tracker/store.js';
import { generateProblemNarrative } from '../reporter/narrator.js';

export const resolveProblemSchema = z.object({
  id: z.string().describe('Problem ID to resolve'),
  solution: z.string().describe('How the problem was solved'),
  tags: z.array(z.string()).optional().default([]).describe('Additional tags'),
  path: z.string().optional().describe('Project root path (defaults to cwd)'),
});

export async function handleResolveProblem(args: z.infer<typeof resolveProblemSchema>) {
  const projectPath = args.path ?? process.cwd();
  const problem = await resolveProblem(projectPath, args.id, args.solution, args.tags);

  if (!problem) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: `Problem with id "${args.id}" not found` }),
        },
      ],
    };
  }

  const narrative = await generateProblemNarrative(
    problem.description,
    args.solution,
    problem.tags,
  );

  problem.narrative = narrative;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ narrative }, null, 2),
      },
    ],
  };
}
