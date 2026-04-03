import { z } from 'zod';
import { readFile } from 'fs/promises';
import { simpleGit } from 'simple-git';
import type { Commit } from '../types/index.js';
import { JavaAnalyzer } from '../analyzers/code/java/java-analyzer.js';
import { glob } from '../analyzers/metrics/glob-helper.js';
import { loadConventions } from '../config/convention-loader.js';
import { calculateMaturityScore } from '../analyzers/metrics/maturity-scorer.js';
import { mineExperiences } from '../analyzers/git/experience-miner.js';
import { detectStrengths } from '../analyzers/code/java/strength-detector.js';
import { detectArchitecture } from '../analyzers/code/java/architecture-detector.js';
import type { JavaProjectContext } from '../analyzers/code/base-analyzer.js';

export const portfolioInsightSchema = z.object({
  path: z.string().optional().describe('Project root path (defaults to cwd)'),
  since: z.string().optional().describe('Git history start date (ISO format, e.g. 2024-01-01)'),
  sections: z.array(z.enum([
    'strengths', 'experiences', 'opportunities', 'maturity', 'all',
  ])).default(['all']).describe('Which sections to include'),
});

export async function handlePortfolioInsight(args: z.infer<typeof portfolioInsightSchema>) {
  const projectPath = args.path ?? process.cwd();
  const files = await glob(projectPath);
  const sections = new Set(args.sections);
  const includeAll = sections.has('all');

  const conventions = await loadConventions(projectPath);
  const context = { projectPath, files, conventions };

  // --- Code Analysis (opportunities + maturity) ---
  const analyzer = new JavaAnalyzer();
  const allOpportunities = await analyzer.analyze(context);
  allOpportunities.sort((a, b) => b.portfolioValue - a.portfolioValue);

  // --- Build result object ---
  const result: Record<string, unknown> = {};

  // Strengths
  if (includeAll || sections.has('strengths')) {
    const javaFiles = files.filter(f =>
      (f.endsWith('.java') || f.endsWith('.kt')) &&
      !f.includes('/build/') && !f.includes('/target/'),
    );

      const fileContents = new Map<string, string>();
      for (const fp of javaFiles) {
        try {
          const content = await readFile(fp, 'utf-8');
          fileContents.set(fp, content);
        } catch { /* skip */ }
      }

      // Build minimal project context for strength detection
      const projectCtx = buildQuickContext(fileContents, conventions);
      const strengths = detectStrengths(projectCtx, conventions, fileContents);
      result.strengths = strengths;
  }

  // Experiences from git
  if (includeAll || sections.has('experiences')) {
    try {
      const git = simpleGit(projectPath);
      const log = await git.log([
        '--no-merges',
        '--stat',
        ...(args.since ? [`--since=${args.since}`] : ['--since=2023-01-01']),
      ]);

      const commits: Commit[] = await Promise.all(
        log.all.slice(0, 200).map(async (entry) => {
          let commitFiles: string[] = [];
          let insertions = 0;
          let deletions = 0;
          try {
            const diff = await simpleGit(projectPath).diffSummary([`${entry.hash}~1`, entry.hash]);
            commitFiles = diff.files.map(f => f.file);
            insertions = diff.insertions;
            deletions = diff.deletions;
          } catch { /* first commit */ }

          return {
            hash: entry.hash,
            message: entry.message,
            date: entry.date,
            author: entry.author_name,
            files: commitFiles,
            insertions,
            deletions,
          };
        }),
      );

      const experiences = mineExperiences(commits);
      result.experiences = experiences;
      result.gitStats = {
        totalCommits: commits.length,
        analyzedPeriod: args.since ?? '2023-01-01 ~',
      };
    } catch {
      result.experiences = [];
      result.gitStats = { error: 'Git 분석 실패 — git 저장소가 아니거나 접근할 수 없습니다' };
    }
  }

  // Opportunities
  if (includeAll || sections.has('opportunities')) {
    result.opportunities = allOpportunities.slice(0, 20);
    result.totalOpportunities = allOpportunities.length;
  }

  // Maturity
  if (includeAll || sections.has('maturity')) {
    result.maturity = calculateMaturityScore(allOpportunities);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

function buildQuickContext(
  fileContents: Map<string, string>,
  conventions: unknown,
): JavaProjectContext {
  const ctx: JavaProjectContext = {
    hasControllerAdvice: false,
    globalExceptionTypes: [],
    serviceClasses: [],
    repositoryInterfaces: [],
    entityClasses: [],
    dtoClasses: [],
    hasSecurityConfig: false,
    testFileMap: new Map(),
    architecture: { detected: 'unknown', confidence: 'low', layers: [] },
    packageStructure: new Map(),
  };

  for (const [filePath, content] of fileContents) {
    const classNameMatch = content.match(/class\s+(\w+)/);
    const className = classNameMatch?.[1] ?? '';

    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    if (packageMatch && className) {
      const pkg = packageMatch[1];
      const existing = ctx.packageStructure.get(pkg) ?? [];
      existing.push(className);
      ctx.packageStructure.set(pkg, existing);
    }

    if (/@ControllerAdvice|@RestControllerAdvice/.test(content)) {
      ctx.hasControllerAdvice = true;
      const handlerMatches = content.matchAll(
        /@ExceptionHandler\s*\(\s*(?:value\s*=\s*)?(?:\{([^}]+)\}|(\w+)\.class)\s*\)/g,
      );
      for (const m of handlerMatches) {
        const types = (m[1] ?? m[2] ?? '').split(',').map(t => t.trim().replace(/\.class$/, ''));
        ctx.globalExceptionTypes.push(...types.filter(Boolean));
      }
    }
    if (/@Service/.test(content) && className) ctx.serviceClasses.push(className);
    if (/interface\s+\w+\s+extends\s+\w*Repository/.test(content) && className) ctx.repositoryInterfaces.push(className);
    if (/@Entity/.test(content) && className) ctx.entityClasses.push(className);
    if (/(?:Dto|DTO|Response|Request)$/.test(className) && className) ctx.dtoClasses.push(className);
    if (/@EnableWebSecurity|@EnableMethodSecurity|SecurityFilterChain/.test(content)) ctx.hasSecurityConfig = true;

    if (filePath.includes('/test/') || filePath.includes('/tests/')) {
      const baseName = filePath.replace(/.*\//, '').replace(/Test\.(java|kt)$/, '').replace(/IT\.(java|kt)$/, '');
      if (baseName) ctx.testFileMap.set(baseName, filePath);
    }
  }

  const conv = conventions as import('../config/conventions.js').SpringConventions;
  ctx.architecture = detectArchitecture(ctx.packageStructure, conv);

  return ctx;
}
