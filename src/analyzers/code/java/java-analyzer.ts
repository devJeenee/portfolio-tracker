import { readFile } from 'fs/promises';
import path from 'path';
import type { CodeAnalyzer, AnalyzerContext, JavaProjectContext } from '../base-analyzer.js';
import type { CodeOpportunity, OpportunityType } from '../../../types/analysis.js';
import type { SpringConventions } from '../../../config/conventions.js';
import { DEFAULT_CONVENTIONS } from '../../../config/conventions.js';
import { detectArchitecture } from './architecture-detector.js';
import { analyzeSpringPatterns } from './rules/spring-patterns.js';
import { analyzeExceptionHandling } from './rules/exception-handling.js';
import { analyzeApiStructure } from './rules/api-structure.js';
import { analyzeTransactionPatterns } from './rules/transaction-patterns.js';
import { analyzeSecurityPatterns } from './rules/security-patterns.js';
import { analyzeLayerArchitecture } from './rules/layer-architecture.js';
import { analyzeTestCoverage } from './rules/test-coverage.js';
import { analyzeApiDesign } from './rules/api-design.js';
import { analyzeArchitectureConformance } from './rules/architecture-conformance.js';
import { analyzeQueryOptimization } from './rules/query-optimization.js';
import { analyzeCachingPatterns } from './rules/caching-patterns.js';
import { analyzeConcurrencySafety } from './rules/concurrency-safety.js';
import { analyzeResiliencePatterns } from './rules/resilience-patterns.js';
import { analyzeObservabilityPatterns } from './rules/observability-patterns.js';
import { analyzeProductionReadiness } from './rules/production-readiness.js';

type RuleFunction = (
  filePath: string,
  content: string,
  context: JavaProjectContext,
  conventions: SpringConventions,
) => CodeOpportunity[];

export class JavaAnalyzer implements CodeAnalyzer {
  name = 'java';

  async analyze(context: AnalyzerContext): Promise<CodeOpportunity[]> {
    const conventions = context.conventions ?? DEFAULT_CONVENTIONS;

    const sourceFiles = context.files.filter(
      f => (f.endsWith('.java') || f.endsWith('.kt')) &&
        !f.includes('node_modules') &&
        !f.includes('/build/') &&
        !f.includes('/target/'),
    );

    if (sourceFiles.length === 0) return [];

    // --- Pass 1: Build cross-file project context ---
    const projectContext = await this.buildProjectContext(sourceFiles, conventions);

    // --- Pass 2: Run all rules with context ---
    const opportunities: CodeOpportunity[] = [];

    // Global check: no test directory at all
    const hasTestDir = context.files.some(
      f => f.includes('/test/') || f.includes('/tests/'),
    );
    if (!hasTestDir) {
      opportunities.push({
        type: 'testing',
        severity: 'high',
        file: context.projectPath,
        current: '테스트 디렉토리가 없습니다',
        suggestion: 'JUnit 5와 Mockito를 사용한 단위 테스트를 추가하세요. Service 계층부터 시작하는 것을 추천합니다',
        portfolioValue: 10,
        keywords: ['JUnit', 'Mockito', 'TDD', '테스트 커버리지'],
      });
    }

    const disabledRules = new Set(conventions.rules?.disabled ?? []);
    const severityOverrides = conventions.rules?.severityOverrides ?? {};

    const rules: RuleFunction[] = [
      analyzeSpringPatterns,
      analyzeExceptionHandling,
      analyzeApiStructure,
      analyzeTransactionPatterns,
      analyzeSecurityPatterns,
      analyzeLayerArchitecture,
      analyzeTestCoverage,
      analyzeApiDesign,
      analyzeArchitectureConformance,
      analyzeQueryOptimization,
      analyzeCachingPatterns,
      analyzeConcurrencySafety,
      analyzeResiliencePatterns,
      analyzeObservabilityPatterns,
      analyzeProductionReadiness,
    ];

    for (const filePath of sourceFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');

        for (const rule of rules) {
          try {
            const results = rule(filePath, content, projectContext, conventions);

            for (const opp of results) {
              // Skip disabled rules
              if (disabledRules.has(opp.type)) continue;

              // Apply severity overrides
              const override = severityOverrides[opp.type];
              if (override) {
                opp.severity = override;
              }

              opportunities.push(opp);
            }
          } catch {
            // Skip rules that fail on specific files
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return opportunities;
  }

  private async buildProjectContext(
    files: string[],
    conventions: SpringConventions,
  ): Promise<JavaProjectContext> {
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

    const sourceFiles: string[] = [];
    const testFiles: string[] = [];

    for (const f of files) {
      if (f.includes('/test/') || f.includes('/tests/')) {
        testFiles.push(f);
      } else {
        sourceFiles.push(f);
      }
    }

    // Build test file map: ClassName → test file path
    for (const tf of testFiles) {
      const baseName = path.basename(tf).replace(/Test\.(java|kt)$/, '').replace(/IT\.(java|kt)$/, '');
      if (baseName) {
        ctx.testFileMap.set(baseName, tf);
      }
    }

    // Scan all source files for context signals
    for (const filePath of sourceFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');
        this.extractContext(filePath, content, ctx);
      } catch {
        // Skip unreadable files
      }
    }

    // Detect architecture from package structure
    ctx.architecture = detectArchitecture(ctx.packageStructure, conventions);

    return ctx;
  }

  private extractContext(filePath: string, content: string, ctx: JavaProjectContext): void {
    const classNameMatch = content.match(/class\s+(\w+)/);
    const className = classNameMatch?.[1] ?? '';

    // Build package structure
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    if (packageMatch && className) {
      const pkg = packageMatch[1];
      const existing = ctx.packageStructure.get(pkg) ?? [];
      existing.push(className);
      ctx.packageStructure.set(pkg, existing);
    }

    // @ControllerAdvice detection
    if (/@ControllerAdvice|@RestControllerAdvice/.test(content)) {
      ctx.hasControllerAdvice = true;

      // Extract handled exception types
      const handlerMatches = content.matchAll(
        /@ExceptionHandler\s*\(\s*(?:value\s*=\s*)?(?:\{([^}]+)\}|(\w+)\.class)\s*\)/g,
      );
      for (const m of handlerMatches) {
        const types = (m[1] ?? m[2] ?? '').split(',').map(t =>
          t.trim().replace(/\.class$/, ''),
        );
        ctx.globalExceptionTypes.push(...types.filter(Boolean));
      }
    }

    // @Service
    if (/@Service/.test(content) && className) {
      ctx.serviceClasses.push(className);
    }

    // Repository interfaces
    if (/interface\s+\w+\s+extends\s+\w*Repository/.test(content) && className) {
      ctx.repositoryInterfaces.push(className);
    }

    // @Entity
    if (/@Entity/.test(content) && className) {
      ctx.entityClasses.push(className);
    }

    // DTO/Response/Request classes
    if (/(?:Dto|DTO|Response|Request)$/.test(className) && className) {
      ctx.dtoClasses.push(className);
    }

    // Spring Security config
    if (
      /@EnableWebSecurity|@EnableMethodSecurity|@EnableGlobalMethodSecurity|SecurityFilterChain/.test(content) ||
      /extends\s+WebSecurityConfigurerAdapter/.test(content)
    ) {
      ctx.hasSecurityConfig = true;
    }
  }
}
