import type { Commit } from '../../types/index.js';

export interface ChurnResult {
  file: string;
  changes: number;
  commits: string[];
  isTroubleshooting: boolean;
}

export function detectChurn(commits: Commit[], threshold = 3): ChurnResult[] {
  const fileChanges = new Map<string, { count: number; commitHashes: string[] }>();

  for (const commit of commits) {
    for (const file of commit.files) {
      const existing = fileChanges.get(file) ?? { count: 0, commitHashes: [] };
      existing.count++;
      if (existing.commitHashes.length < 50) {
        existing.commitHashes.push(commit.hash);
      }
      fileChanges.set(file, existing);
    }
  }

  const results: ChurnResult[] = [];

  for (const [file, data] of fileChanges) {
    if (data.count >= threshold) {
      const relatedCommits = commits.filter(c => data.commitHashes.includes(c.hash));
      const hasFixCommits = relatedCommits.some(c =>
        /fix|bug|error|issue|broken|debug/i.test(c.message),
      );

      results.push({
        file,
        changes: data.count,
        commits: data.commitHashes,
        isTroubleshooting: hasFixCommits,
      });
    }
  }

  return results.sort((a, b) => b.changes - a.changes);
}

export function detectConvergence(commits: Commit[]): Array<{
  file: string;
  initialDiff: number;
  finalDiff: number;
  converged: boolean;
}> {
  const fileHistory = new Map<string, Array<{ diff: number; date: string }>>();

  for (const commit of commits) {
    for (const file of commit.files) {
      const history = fileHistory.get(file) ?? [];
      if (history.length < 100) {
        history.push({
          diff: commit.insertions + commit.deletions,
          date: commit.date,
        });
      }
      fileHistory.set(file, history);
    }
  }

  const results: Array<{
    file: string;
    initialDiff: number;
    finalDiff: number;
    converged: boolean;
  }> = [];

  for (const [file, history] of fileHistory) {
    if (history.length < 3) continue;

    const firstHalf = history.slice(0, Math.floor(history.length / 2));
    const secondHalf = history.slice(Math.floor(history.length / 2));

    const avgFirst = firstHalf.reduce((sum, h) => sum + h.diff, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, h) => sum + h.diff, 0) / secondHalf.length;

    if (avgFirst > avgSecond * 1.5) {
      results.push({
        file,
        initialDiff: Math.round(avgFirst),
        finalDiff: Math.round(avgSecond),
        converged: true,
      });
    }
  }

  return results;
}
