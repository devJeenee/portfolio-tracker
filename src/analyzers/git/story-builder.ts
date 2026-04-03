import type { Commit, Significance } from '../../types/index.js';
import type { GitStory, StoryType } from '../../types/analysis.js';
import { classifyCommit, isSignificantCommit } from './commit-analyzer.js';
import { detectChurn } from './churn-detector.js';

export function buildStories(commits: Commit[]): GitStory[] {
  const stories: GitStory[] = [];

  const churnStories = buildChurnStories(commits);
  stories.push(...churnStories);

  const typeGroups = groupByType(commits);
  for (const [type, grouped] of typeGroups) {
    const timeGroups = groupByTimeWindow(grouped, 7);
    for (const group of timeGroups) {
      if (group.length < 2) continue;

      const allFiles = [...new Set(group.flatMap(c => c.files))];
      const story = createStory(type, group, allFiles);

      const isDuplicate = stories.some(
        s => s.type === story.type && s.files.some(f => story.files.includes(f)),
      );
      if (!isDuplicate) {
        stories.push(story);
      }
    }
  }

  return stories.sort((a, b) => {
    const sigOrder: Record<Significance, number> = { high: 0, medium: 1, low: 2 };
    return sigOrder[a.significance] - sigOrder[b.significance];
  });
}

function buildChurnStories(commits: Commit[]): GitStory[] {
  const churnResults = detectChurn(commits, 3);
  const stories: GitStory[] = [];

  for (const churn of churnResults.slice(0, 5)) {
    if (!churn.isTroubleshooting) continue;

    const relatedCommits = commits.filter(c => churn.commits.includes(c.hash));
    if (relatedCommits.length < 2) continue;

    stories.push(
      createStory('troubleshooting', relatedCommits, [churn.file]),
    );
  }

  return stories;
}

function groupByType(commits: Commit[]): Map<StoryType, Commit[]> {
  const groups = new Map<StoryType, Commit[]>();

  for (const commit of commits) {
    const { type, confidence } = classifyCommit(commit);
    if (confidence < 0.1) continue;

    const existing = groups.get(type) ?? [];
    existing.push(commit);
    groups.set(type, existing);
  }

  return groups;
}

function groupByTimeWindow(commits: Commit[], windowDays: number): Commit[][] {
  if (commits.length === 0) return [];

  const sorted = [...commits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const groups: Commit[][] = [];
  let currentGroup: Commit[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date).getTime();
    const curr = new Date(sorted[i].date).getTime();
    const daysDiff = (curr - prev) / (1000 * 60 * 60 * 24);

    if (daysDiff <= windowDays) {
      currentGroup.push(sorted[i]);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }

  if (currentGroup.length > 0) groups.push(currentGroup);
  return groups;
}

function createStory(type: StoryType, commits: Commit[], files: string[]): GitStory {
  const sorted = [...commits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const firstDate = new Date(sorted[0].date);
  const lastDate = new Date(sorted[sorted.length - 1].date);
  const daysDiff = Math.ceil(
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  const duration =
    daysDiff === 0
      ? '1일'
      : daysDiff < 7
        ? `${daysDiff}일`
        : `${Math.ceil(daysDiff / 7)}주`;

  const hasSignificant = commits.some(isSignificantCommit);
  const significance: Significance =
    hasSignificant || commits.length >= 5
      ? 'high'
      : commits.length >= 3
        ? 'medium'
        : 'low';

  const title = generateTitle(type, commits, files);

  return {
    type,
    title,
    commits: sorted,
    files: [...new Set(files)],
    duration,
    significance,
  };
}

function generateTitle(type: StoryType, commits: Commit[], files: string[]): string {
  const mainFile = files[0] ?? 'unknown';
  const shortFile = mainFile.split('/').pop() ?? mainFile;

  switch (type) {
    case 'troubleshooting':
      return `${shortFile} 관련 버그 수정 (${commits.length}건)`;
    case 'refactoring':
      return `${shortFile} 리팩토링 (${commits.length}건)`;
    case 'architecture':
      return `아키텍처 변경: ${shortFile} (${commits.length}건)`;
    case 'optimization':
      return `성능 개선: ${shortFile} (${commits.length}건)`;
  }
}
