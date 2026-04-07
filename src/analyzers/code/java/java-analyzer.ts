import { readFile } from 'fs/promises';
import path from 'path';
import type { CodeAnalyzer, AnalyzerContext, JavaProjectContext } from '../base-analyzer.js';
import type { CodeOpportunity, OpportunityType } from '../../../types/analysis.js';
import type { SpringConventions } from '../../../config/conventions.js';
import { DEFAULT_CONVENTIONS } from '../../../config/conventions.js';
import { detectArchitecture } from './architecture-detector.js';
import { batchProcess } from '../../../utils/batch.js';
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
import { analyzeAsyncPatterns } from './rules/async-patterns.js';
import { analyzeAsyncAdvancedPatterns } from './rules/async-advanced-patterns.js';
import { analyzeResiliencePatterns } from './rules/resilience-patterns.js';
import { analyzeObservabilityPatterns } from './rules/observability-patterns.js';
import { analyzeProductionReadiness } from './rules/production-readiness.js';
import { analyzeCodeQualityPatterns } from './rules/code-quality-patterns.js';
import { getLineNumber } from '../../../utils/line-number.js';

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
      analyzeAsyncPatterns,
      analyzeAsyncAdvancedPatterns,
      analyzeResiliencePatterns,
      analyzeObservabilityPatterns,
      analyzeProductionReadiness,
      analyzeCodeQualityPatterns,
    ];

    const fileOpportunities = await batchProcess(sourceFiles, async (filePath) => {
      const results: CodeOpportunity[] = [];
      try {
        const content = await readFile(filePath, 'utf-8');

        for (const rule of rules) {
          try {
            const ruleResults = rule(filePath, content, projectContext, conventions);

            for (const opp of ruleResults) {
              if (disabledRules.has(opp.type)) continue;

              const override = severityOverrides[opp.type];
              if (override) {
                opp.severity = override;
              }

              results.push(opp);
            }
          } catch {
            // Skip rules that fail on specific files
          }
        }
      } catch {
        // Skip files that can't be read
      }
      return results;
    }, 20);

    opportunities.push(...fileOpportunities.flat());

    // --- Config file secret scan ---
    const configFiles = context.files.filter(
      f => /\.(yml|yaml|properties)$/.test(f) &&
        !f.includes('node_modules') &&
        !f.includes('/build/') &&
        !f.includes('/target/'),
    );

    const configOpportunities = await batchProcess(configFiles, async (filePath) => {
      try {
        const content = await readFile(filePath, 'utf-8');
        return this.detectConfigSecrets(filePath, content);
      } catch {
        return [];
      }
    }, 20);

    opportunities.push(...configOpportunities.flat());

    return opportunities;
  }

  private detectConfigSecrets(filePath: string, content: string): CodeOpportunity[] {
    const opportunities: CodeOpportunity[] = [];

    const secretPatterns = [
      /(?:password|passwd|pwd)\s*[:=]\s*(?!\$\{)([^\s#]+)/gi,
      /(?:secret|api[_-]?key|api[_-]?secret)\s*[:=]\s*(?!\$\{)([^\s#]+)/gi,
      /(?:token|access[_-]?token)\s*[:=]\s*(?!\$\{)([^\s#]{8,})/gi,
      /(?:private[_-]?key)\s*[:=]\s*(?!\$\{)([^\s#]{8,})/gi,
    ];

    let totalMatches = 0;
    let firstLine: number | undefined;

    for (const pattern of secretPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        // Skip placeholder values like ${ENV_VAR}
        const value = match[1];
        if (!value || /^\$\{/.test(value) || /^$/.test(value.trim())) continue;
        totalMatches++;
        if (firstLine === undefined) {
          firstLine = getLineNumber(content, match.index);
        }
      }
    }

    if (totalMatches > 0) {
      opportunities.push({
        type: 'hardcoded-secret',
        severity: 'high',
        file: filePath,
        line: firstLine,
        current: `설정 파일에 하드코딩된 시크릿이 ${totalMatches}개 감지되었습니다`,
        suggestion: '환경 변수(${ENV_VAR}) 또는 Vault/AWS Secrets Manager를 사용하세요',
        portfolioValue: 9,
        keywords: ['시크릿 관리', '보안', '환경 변수', '12-Factor App'],
      });
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
      hasEnableAsync: false,
      hasAsyncConfigurer: false,
      asyncMethods: new Map(),
      hasSchedulingConfig: false,
      scheduledMethodCount: 0,
      hasAsyncExceptionHandler: false,
      isReactiveProject: false,
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
    await batchProcess(sourceFiles, async (filePath) => {
      try {
        const content = await readFile(filePath, 'utf-8');
        this.extractContext(filePath, content, ctx);
      } catch {
        // Skip unreadable files
      }
    }, 20);

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

    // @EnableAsync detection
    if (/@EnableAsync\b/.test(content)) {
      ctx.hasEnableAsync = true;
    }

    // AsyncConfigurer implementation or custom Executor bean
    if (
      /implements\s+AsyncConfigurer/.test(content) ||
      /(?:@Bean|@Primary)[\s\S]*?(?:Executor|ThreadPoolTaskExecutor)\s+\w+\s*\(/.test(content)
    ) {
      ctx.hasAsyncConfigurer = true;
    }

    // Collect @Async methods per class
    if (className && /@Async\b/.test(content)) {
      const asyncMethodPattern = /@Async\b[\s\S]*?(?:public|protected)\s+(?:\w+\s+)*(\w+)\s*\(/g;
      const methods: string[] = [];
      let am: RegExpExecArray | null;
      while ((am = asyncMethodPattern.exec(content)) !== null) {
        if (am[0].length < 300) methods.push(am[1]);
      }
      if (methods.length > 0) {
        ctx.asyncMethods.set(className, methods);
      }
    }

    // @EnableScheduling / SchedulingConfigurer / TaskScheduler bean
    if (
      /@EnableScheduling\b/.test(content) ||
      /implements\s+SchedulingConfigurer/.test(content) ||
      /(?:@Bean)[\s\S]*?TaskScheduler\s+\w+\s*\(/.test(content)
    ) {
      ctx.hasSchedulingConfig = true;
    }

    // Count @Scheduled methods
    const scheduledMatches = content.match(/@Scheduled\b/g);
    if (scheduledMatches) {
      ctx.scheduledMethodCount += scheduledMatches.length;
    }

    // AsyncUncaughtExceptionHandler
    if (/AsyncUncaughtExceptionHandler/.test(content)) {
      ctx.hasAsyncExceptionHandler = true;
    }

    // Reactive project detection (WebFlux / Reactor)
    if (
      /spring-boot-starter-webflux/.test(content) ||
      /import\s+reactor\.core\.publisher\.(?:Mono|Flux)/.test(content) ||
      /import\s+org\.springframework\.web\.reactive/.test(content)
    ) {
      ctx.isReactiveProject = true;
    }
  }
}
