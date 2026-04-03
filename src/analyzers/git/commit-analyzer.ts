import type { Commit } from '../../types/index.js';
import type { StoryType } from '../../types/analysis.js';

interface CommitClassification {
  type: StoryType;
  confidence: number;
}

const PATTERNS: Record<StoryType, RegExp[]> = {
  troubleshooting: [
    /fix(?:e[ds])?[\s:(]/i,
    /bug(?:fix)?/i,
    /hotfix/i,
    /patch/i,
    /resolve[ds]?/i,
    /workaround/i,
    /debug/i,
    /issue/i,
    /error/i,
    /broken/i,
  ],
  refactoring: [
    /refactor/i,
    /restructur/i,
    /reorganiz/i,
    /clean\s?up/i,
    /simplif/i,
    /extract/i,
    /rename/i,
    /move\s/i,
    /split/i,
    /merge/i,
  ],
  architecture: [
    /architect/i,
    /migrat/i,
    /redesign/i,
    /overhaul/i,
    /rewrit/i,
    /setup/i,
    /init(?:ial)?/i,
    /scaffold/i,
    /infra/i,
    /config/i,
  ],
  optimization: [
    /optimi[zs]/i,
    /perf(?:ormance)?/i,
    /speed/i,
    /cache/i,
    /lazy/i,
    /memo/i,
    /batch/i,
    /parallel/i,
    /reduc(?:e|ing)\s.*(?:size|bundle|load)/i,
  ],
};

export function classifyCommit(commit: Commit): CommitClassification {
  const message = commit.message.toLowerCase();

  let bestType: StoryType = 'troubleshooting';
  let bestConfidence = 0;

  for (const [type, patterns] of Object.entries(PATTERNS) as [StoryType, RegExp[]][]) {
    let matches = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matches++;
      }
    }
    const confidence = matches / patterns.length;
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestType = type;
    }
  }

  if (bestConfidence === 0) {
    if (commit.deletions > commit.insertions * 2) {
      return { type: 'refactoring', confidence: 0.3 };
    }
    if (commit.files.some(f => f.includes('config') || f.includes('setup'))) {
      return { type: 'architecture', confidence: 0.2 };
    }
    return { type: 'troubleshooting', confidence: 0.1 };
  }

  return { type: bestType, confidence: bestConfidence };
}

export function isSignificantCommit(commit: Commit): boolean {
  const totalChanges = commit.insertions + commit.deletions;
  if (totalChanges > 100) return true;
  if (commit.files.length > 5) return true;

  const message = commit.message.toLowerCase();
  const significantWords = ['breaking', 'major', 'critical', 'important', 'milestone'];
  return significantWords.some(w => message.includes(w));
}
