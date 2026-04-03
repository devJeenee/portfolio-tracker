import type { ReportLanguage } from './index.js';

export interface ReportConfig {
  language: ReportLanguage;
  sections?: string[];
}

export interface ReportResult {
  report: string;
  savedTo: string;
}

export interface ReportSection {
  title: string;
  content: string;
}

export interface NarratorInput {
  projectName: string;
  techStack: string[];
  period: { firstCommit: string; lastCommit: string; totalCommits: number };
  stories: Array<{
    type: string;
    title: string;
    duration: string;
    significance: string;
    files: string[];
  }>;
  opportunities: Array<{
    type: string;
    severity: string;
    current: string;
    suggestion: string;
    portfolioValue: number;
    keywords: string[];
  }>;
  problems: Array<{
    description: string;
    solution?: string;
    tags: string[];
  }>;
  stats: {
    files: number;
    components: number;
    hooks: number;
    lines: number;
    testFiles: number;
  };
}
