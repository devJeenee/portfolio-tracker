import { z } from 'zod';
import { simpleGit } from 'simple-git';
import type { Commit } from '../types/index.js';
import type { GitAnalysis } from '../types/analysis.js';
import { buildStories } from '../analyzers/git/story-builder.js';
import { detectChurn } from '../analyzers/git/churn-detector.js';

export const analyzeGitSchema = z.object({
  path: z.string().optional().describe('Project root path (defaults to cwd)'),
  since: z.string().optional().describe('Start date (ISO format)'),
  until: z.string().optional().describe('End date (ISO format)'),
});

export async function handleAnalyzeGit(args: z.infer<typeof analyzeGitSchema>) {
  const projectPath = args.path ?? process.cwd();
  const git = simpleGit(projectPath);

  const log = await git.log([
    '--no-merges',
    '--stat',
    ...(args.since ? [`--since=${args.since}`] : []),
    ...(args.until ? [`--until=${args.until}`] : []),
  ]);

  const commits: Commit[] = await Promise.all(
    log.all.map(async (entry) => {
      let files: string[] = [];
      let insertions = 0;
      let deletions = 0;

      try {
        const diff = await git.diffSummary([`${entry.hash}~1`, entry.hash]);
        files = diff.files.map(f => f.file);
        insertions = diff.insertions;
        deletions = diff.deletions;
      } catch {
        // First commit or error
      }

      return {
        hash: entry.hash,
        message: entry.message,
        date: entry.date,
        author: entry.author_name,
        files,
        insertions,
        deletions,
      };
    }),
  );

  const stories = buildStories(commits);
  const churnResults = detectChurn(commits);

  const totalDays = commits.length > 1
    ? Math.max(1, Math.ceil(
        (new Date(commits[0].date).getTime() - new Date(commits[commits.length - 1].date).getTime()) /
        (1000 * 60 * 60 * 24),
      ))
    : 1;

  const refactorCommits = commits.filter(c =>
    /refactor|restructur|clean|simplif/i.test(c.message),
  );

  const analysis: GitAnalysis = {
    stories,
    stats: {
      avgCommitsPerDay: Math.round((commits.length / totalDays) * 100) / 100,
      topChangedFiles: churnResults.slice(0, 10).map(c => c.file),
      refactorRatio: commits.length > 0
        ? Math.round((refactorCommits.length / commits.length) * 100) / 100
        : 0,
    },
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
