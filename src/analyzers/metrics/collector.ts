import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import type { ProjectInfo, ProjectStats, ProjectPeriod } from '../../types/index.js';
import { simpleGit } from 'simple-git';
import { glob } from './glob-helper.js';

export async function collectProjectInfo(projectPath: string): Promise<ProjectInfo> {
  const [techStack, languages] = await detectTechStack(projectPath);
  const stats = await collectStats(projectPath, languages);
  const period = await collectPeriod(projectPath);
  const structure = await buildStructureTree(projectPath);
  const name = await detectProjectName(projectPath);

  return { name, techStack, languages, stats, period, structure };
}

async function detectProjectName(projectPath: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(projectPath, 'package.json'), 'utf-8'));
    return pkg.name ?? projectPath.split('/').pop() ?? 'unknown';
  } catch {
    try {
      const pom = await readFile(join(projectPath, 'pom.xml'), 'utf-8');
      const match = /<artifactId>([^<]+)<\/artifactId>/.exec(pom);
      return match?.[1] ?? projectPath.split('/').pop() ?? 'unknown';
    } catch {
      return projectPath.split('/').pop() ?? 'unknown';
    }
  }
}

async function detectTechStack(projectPath: string): Promise<[string[], string[]]> {
  const techStack: string[] = [];
  const languages: string[] = [];

  try {
    const pkg = JSON.parse(await readFile(join(projectPath, 'package.json'), 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    languages.push('TypeScript');
    if (allDeps['react-native'] || allDeps['expo']) techStack.push('React Native');
    else if (allDeps['react']) techStack.push('React');
    if (allDeps['next']) techStack.push('Next.js');
    if (allDeps['express'] || allDeps['fastify'] || allDeps['nestjs']) techStack.push('Node.js');
    if (allDeps['expo']) techStack.push('Expo');
    if (allDeps['@tanstack/react-query']) techStack.push('TanStack Query');
    if (allDeps['zustand']) techStack.push('Zustand');
    if (allDeps['tailwindcss']) techStack.push('Tailwind CSS');
  } catch {
    // Not a Node.js project
  }

  try {
    await stat(join(projectPath, 'pom.xml'));
    languages.push('Java');
    techStack.push('Spring Boot', 'Maven');
  } catch {
    try {
      await stat(join(projectPath, 'build.gradle'));
      languages.push('Java');
      techStack.push('Spring Boot', 'Gradle');
    } catch {
      // Not a Java project
    }
  }

  if (languages.length === 0) languages.push('Unknown');
  return [techStack, languages];
}

async function collectStats(projectPath: string, languages: string[]): Promise<ProjectStats> {
  let files = 0;
  let components = 0;
  let hooks = 0;
  let lines = 0;
  let testFiles = 0;

  const allFiles = await glob(projectPath);

  for (const file of allFiles) {
    files++;

    if (/\.(test|spec)\.(ts|tsx|js|jsx|java)$/.test(file)) {
      testFiles++;
    }

    try {
      const content = await readFile(file, 'utf-8');
      lines += content.split('\n').length;

      if (file.endsWith('.tsx')) {
        if (/export\s+(default\s+)?function\s+[A-Z]/.test(content) ||
            /export\s+const\s+[A-Z]\w+\s*[:=]/.test(content)) {
          components++;
        }
      }

      if (/^(export\s+)?function\s+use[A-Z]/.test(content) ||
          /^(export\s+)?const\s+use[A-Z]\w+\s*=/.test(content)) {
        hooks++;
      }
    } catch {
      // Skip unreadable files
    }
  }

  return { files, components, hooks, lines, testFiles };
}

async function collectPeriod(projectPath: string): Promise<ProjectPeriod> {
  try {
    const git = simpleGit(projectPath);
    const log = await git.log();

    return {
      firstCommit: log.all.length > 0 ? log.all[log.all.length - 1].date : 'N/A',
      lastCommit: log.all.length > 0 ? log.all[0].date : 'N/A',
      totalCommits: log.total,
    };
  } catch {
    return { firstCommit: 'N/A', lastCommit: 'N/A', totalCommits: 0 };
  }
}

async function buildStructureTree(projectPath: string): Promise<string> {
  const allFiles = await glob(projectPath);
  const dirs = new Set<string>();

  for (const file of allFiles) {
    const relative = file.replace(projectPath + '/', '');
    const parts = relative.split('/');
    if (parts.length >= 2) {
      dirs.add(parts.slice(0, 2).join('/'));
    } else {
      dirs.add(parts[0]);
    }
  }

  const sorted = [...dirs].sort();
  return sorted.map(d => `  ${d}/`).join('\n');
}
