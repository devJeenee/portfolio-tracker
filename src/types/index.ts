export type Language = 'java' | 'auto';
export type ReportLanguage = 'ko' | 'en';
export type Significance = 'high' | 'medium' | 'low';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Severity = 'high' | 'medium' | 'low';

export interface ProjectInfo {
  name: string;
  techStack: string[];
  languages: string[];
  stats: ProjectStats;
  period: ProjectPeriod;
  structure: string;
}

export interface ProjectStats {
  files: number;
  components: number;
  hooks: number;
  lines: number;
  testFiles: number;
}

export interface ProjectPeriod {
  firstCommit: string;
  lastCommit: string;
  totalCommits: number;
}

export interface Commit {
  hash: string;
  message: string;
  date: string;
  author: string;
  files: string[];
  insertions: number;
  deletions: number;
}

export interface Problem {
  id: string;
  description: string;
  context?: string;
  tags: string[];
  loggedAt: string;
  resolvedAt?: string;
  solution?: string;
  narrative?: string;
}
