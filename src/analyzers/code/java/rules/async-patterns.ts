import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeAsyncPatterns(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  if (filePath.includes('/test/') || filePath.includes('/tests/')) return opportunities;

  detectAsyncWithoutEnableAsync(filePath, content, context, opportunities);
  detectAsyncOnPrivateMethod(filePath, content, opportunities);
  detectAsyncSelfInvocation(filePath, content, opportunities);
  detectAsyncVoidNoErrorHandling(filePath, content, context, opportunities);
  detectAsyncWrongReturnType(filePath, content, opportunities);
  detectMissingAsyncThreadPool(filePath, content, context, opportunities);
  detectAsyncTransactionalConflict(filePath, content, opportunities);

  return opportunities;
}

/** @Async 사용하는데 프로젝트에 @EnableAsync 없음 */
function detectAsyncWithoutEnableAsync(
  filePath: string,
  _content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  if (context.asyncMethods.size === 0 || context.hasEnableAsync) return;

  // Only report once per project — attach to the first file that has @Async
  const firstAsyncClass = [...context.asyncMethods.keys()][0];
  if (!filePath.includes(firstAsyncClass)) return;

  opportunities.push({
    type: 'async-without-enable',
    severity: 'high',
    file: filePath,
    current: '@Async 어노테이션을 사용하고 있지만 @EnableAsync 설정이 프로젝트에 없습니다. @Async가 동작하지 않고 동기로 실행됩니다',
    suggestion: '@Configuration 클래스에 @EnableAsync를 추가하세요. 없으면 Spring AOP 프록시가 생성되지 않아 @Async가 완전히 무시됩니다',
    portfolioValue: 10,
    keywords: ['@Async', '@EnableAsync', 'Spring AOP', '비동기 설정'],
  });
}

/** private 메서드에 @Async → 프록시 우회, 동기 실행됨 */
function detectAsyncOnPrivateMethod(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Match @Async followed by private method declaration
  const pattern = /@Async\b[\s\S]*?private\s+(?:\w+\s+)*\w+\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    // Ensure @Async and private are close together (within 200 chars — annotations + modifiers)
    if (match[0].length > 300) continue;

    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'async-private-method',
      severity: 'high',
      file: filePath,
      line,
      current: 'private 메서드에 @Async를 사용하고 있습니다. Spring 프록시는 public 메서드만 가로챌 수 있어 동기로 실행됩니다',
      suggestion: '메서드를 public으로 변경하거나, 별도의 Bean으로 분리하세요. Spring AOP 프록시 기반 @Async는 private 메서드에서 동작하지 않습니다',
      portfolioValue: 9,
      keywords: ['@Async', 'Spring Proxy', 'AOP', 'private 메서드'],
    });
  }
}

/** 같은 클래스 내에서 @Async 메서드 호출 → 프록시 우회 */
function detectAsyncSelfInvocation(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Step 1: Collect @Async method names in this file
  const asyncMethodPattern = /@Async\b[\s\S]*?(?:public|protected)\s+(?:\w+\s+)*(\w+)\s*\(/g;
  const asyncMethods: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = asyncMethodPattern.exec(content)) !== null) {
    if (m[0].length < 300) {
      asyncMethods.push(m[1]);
    }
  }

  if (asyncMethods.length === 0) return;

  // Step 2: Check if any @Async method is called from within the same class
  for (const methodName of asyncMethods) {
    // Match this.methodName( or bare methodName( but not in the @Async method's own declaration
    const callPattern = new RegExp(
      `(?:this\\.)?${methodName}\\s*\\(`,
      'g',
    );
    const asyncDeclPattern = new RegExp(`@Async[\\s\\S]*?\\b${methodName}\\s*\\(`);

    let callMatch: RegExpExecArray | null;
    while ((callMatch = callPattern.exec(content)) !== null) {
      // Skip if this is the @Async method declaration itself
      const surrounding = content.substring(Math.max(0, callMatch.index - 200), callMatch.index);
      if (asyncDeclPattern.test(surrounding)) continue;

      // Check that this call site is inside a method body (not the async method declaration)
      const line = content.substring(0, callMatch.index).split('\n').length;

      opportunities.push({
        type: 'async-self-invocation',
        severity: 'high',
        file: filePath,
        line,
        current: `같은 클래스 내에서 @Async 메서드 '${methodName}'를 직접 호출하고 있습니다. 프록시를 거치지 않아 동기로 실행됩니다`,
        suggestion: '@Async 메서드를 별도의 Bean으로 분리하거나, ApplicationContext에서 자기 자신의 프록시를 주입받아 호출하세요',
        portfolioValue: 9,
        keywords: ['@Async', 'Self-Invocation', 'Spring Proxy', 'AOP 우회'],
      });
      break; // One warning per method is enough
    }
  }
}

/** @Async void 반환 + AsyncUncaughtExceptionHandler 없음 → 에러 삼킴 */
function detectAsyncVoidNoErrorHandling(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  if (context.hasAsyncExceptionHandler) return;

  // Detect @Async void methods
  const pattern = /@Async\b[\s\S]*?(?:public|protected)\s+void\s+(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match[0].length > 300) continue;

    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'async-void-no-error-handling',
      severity: 'high',
      file: filePath,
      line,
      current: `@Async void 메서드 '${match[1]}'에서 발생한 예외가 호출자에게 전달되지 않고 조용히 삼켜집니다`,
      suggestion: 'AsyncUncaughtExceptionHandler를 구현하거나, CompletableFuture<Void>를 반환하여 예외를 전파하세요',
      portfolioValue: 8,
      keywords: ['@Async', 'void', 'AsyncUncaughtExceptionHandler', '에러 처리'],
    });
    break; // One warning per file
  }
}

/** @Async가 Future/CompletableFuture 아닌 타입 반환 */
function detectAsyncWrongReturnType(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // @Async methods that return something other than void, Future, CompletableFuture, ListenableFuture
  const pattern = /@Async\b[\s\S]*?(?:public|protected)\s+(\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match[0].length > 300) continue;

    const returnType = match[1];
    // Skip valid return types
    if (/^(?:void|Future|CompletableFuture|ListenableFuture|CompletionStage)/.test(returnType)) continue;

    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'async-wrong-return-type',
      severity: 'medium',
      file: filePath,
      line,
      current: `@Async 메서드 '${match[2]}'가 '${returnType}'을 반환합니다. 호출자가 결과를 받을 수 없습니다`,
      suggestion: 'CompletableFuture<' + returnType + '>을 반환하거나, 결과가 필요 없으면 void를 사용하세요',
      portfolioValue: 7,
      keywords: ['@Async', 'CompletableFuture', '반환 타입', '비동기 결과'],
    });
  }
}

/** @EnableAsync는 있으나 커스텀 Executor 설정 없음 → SimpleAsyncTaskExecutor 무제한 스레드 */
function detectMissingAsyncThreadPool(
  filePath: string,
  _content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  if (!context.hasEnableAsync || context.hasAsyncConfigurer) return;
  if (context.asyncMethods.size === 0) return;

  // Only report once — attach to the first file that has @Async
  const firstAsyncClass = [...context.asyncMethods.keys()][0];
  if (!filePath.includes(firstAsyncClass)) return;

  opportunities.push({
    type: 'missing-async-thread-pool',
    severity: 'high',
    file: filePath,
    current: '@EnableAsync가 설정되어 있지만 커스텀 Executor가 없습니다. 기본 SimpleAsyncTaskExecutor는 요청마다 새 스레드를 생성하여 리소스를 고갈시킬 수 있습니다',
    suggestion: 'AsyncConfigurer를 구현하거나 ThreadPoolTaskExecutor Bean을 등록하세요. corePoolSize, maxPoolSize, queueCapacity를 설정하여 스레드 수를 제한하세요',
    portfolioValue: 9,
    keywords: ['@EnableAsync', 'ThreadPoolTaskExecutor', 'SimpleAsyncTaskExecutor', '스레드 풀'],
  });
}

/** @Async + @Transactional 동시 사용 → 트랜잭션 전파 안됨 */
function detectAsyncTransactionalConflict(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Find methods that have both @Async and @Transactional within 200 chars
  const methodPattern = /(?:@Async\b[\s\S]{0,200}?@Transactional\b|@Transactional\b[\s\S]{0,200}?@Async\b)[\s\S]*?(?:public|protected)\s+(?:\w+\s+)*(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'async-transactional-conflict',
      severity: 'high',
      file: filePath,
      line,
      current: `메서드 '${match[1]}'에 @Async와 @Transactional이 동시에 적용되어 있습니다. @Async는 별도 스레드에서 실행되므로 호출자의 트랜잭션이 전파되지 않습니다`,
      suggestion: '@Async 메서드에서는 새로운 트랜잭션(@Transactional(propagation = REQUIRES_NEW))을 시작하거나, 트랜잭션 로직을 별도 서비스로 분리하세요',
      portfolioValue: 9,
      keywords: ['@Async', '@Transactional', '트랜잭션 전파', '비동기 트랜잭션'],
    });
  }
}
