import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Problem } from '../types/index.js';

const PORTFOLIO_DIR = '.portfolio';
const PROBLEMS_FILE = 'problems.json';

function getProblemsPath(projectPath: string): string {
  return join(projectPath, PORTFOLIO_DIR, PROBLEMS_FILE);
}

async function ensureDir(projectPath: string): Promise<void> {
  await mkdir(join(projectPath, PORTFOLIO_DIR), { recursive: true });
}

export async function loadProblems(projectPath: string): Promise<Problem[]> {
  try {
    const content = await readFile(getProblemsPath(projectPath), 'utf-8');
    return JSON.parse(content) as Problem[];
  } catch {
    return [];
  }
}

export async function saveProblems(projectPath: string, problems: Problem[]): Promise<void> {
  await ensureDir(projectPath);
  await writeFile(getProblemsPath(projectPath), JSON.stringify(problems, null, 2), 'utf-8');
}

export async function logProblem(
  projectPath: string,
  description: string,
  context?: string,
  tags: string[] = [],
): Promise<Problem> {
  const problems = await loadProblems(projectPath);

  const problem: Problem = {
    id: randomUUID().slice(0, 8),
    description,
    context,
    tags,
    loggedAt: new Date().toISOString(),
  };

  problems.push(problem);
  await saveProblems(projectPath, problems);

  return problem;
}

export async function resolveProblem(
  projectPath: string,
  id: string,
  solution: string,
  tags: string[] = [],
): Promise<Problem | null> {
  const problems = await loadProblems(projectPath);
  const problem = problems.find(p => p.id === id);

  if (!problem) return null;

  problem.solution = solution;
  problem.resolvedAt = new Date().toISOString();
  problem.tags = [...new Set([...problem.tags, ...tags])];

  await saveProblems(projectPath, problems);
  return problem;
}
