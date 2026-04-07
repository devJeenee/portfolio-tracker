import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeAsyncAdvancedPatterns(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  if (filePath.includes('/test/') || filePath.includes('/tests/')) return opportunities;

  detectCompletableFutureGetWithoutTimeout(filePath, content, opportunities);
  detectCompletableFutureMissingErrorHandling(filePath, content, opportunities);
  detectScheduledWithoutErrorHandling(filePath, content, opportunities);
  detectScheduledSingleThread(filePath, content, context, opportunities);
  detectEventListenerBlocking(filePath, content, opportunities);
  detectThreadLocalWithoutCleanup(filePath, content, opportunities);
  detectBlockingInReactiveChain(filePath, content, context, opportunities);
  detectUnsafeLazyInit(filePath, content, opportunities);

  return opportunities;
}

/** .get() timeout 없이 호출 → 무한 블로킹 */
function detectCompletableFutureGetWithoutTimeout(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  if (!content.includes('CompletableFuture') && !content.includes('Future')) return;

  // Match .get() without arguments (no timeout)
  // Exclude .get(key) for Map access by checking for preceding Future type
  const pattern = /\.get\s*\(\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    // Check surrounding context for Future-related type
    const preceding = content.substring(Math.max(0, match.index - 300), match.index);
    if (!/(?:Future|CompletableFuture|CompletionStage)\b/.test(preceding)) continue;

    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'future-get-without-timeout',
      severity: 'high',
      file: filePath,
      line,
      current: 'CompletableFuture.get()을 timeout 없이 호출하고 있습니다. 응답이 오지 않으면 스레드가 영원히 블로킹됩니다',
      suggestion: '.get(timeout, TimeUnit)을 사용하거나, .orTimeout(duration, unit)을 체인에 추가하세요. 비동기 결과를 기다릴 때는 항상 timeout을 설정하세요',
      portfolioValue: 9,
      keywords: ['CompletableFuture', 'timeout', 'blocking', '무한 대기'],
    });
    break; // One warning per file
  }
}

/** thenApply/thenAccept 체인에 exceptionally/handle 없음 */
function detectCompletableFutureMissingErrorHandling(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  if (!content.includes('CompletableFuture')) return;

  // Check if there are thenApply/thenAccept chains
  const hasChain = /\.then(?:Apply|Accept|Compose|Run)\s*\(/.test(content);
  if (!hasChain) return;

  // Check for error handling in the chain
  const hasErrorHandling = /\.(?:exceptionally|handle|whenComplete)\s*\(/.test(content);
  if (hasErrorHandling) return;

  opportunities.push({
    type: 'future-missing-error-handling',
    severity: 'medium',
    file: filePath,
    current: 'CompletableFuture 체인에 에러 처리(exceptionally/handle)가 없습니다. 예외 발생 시 조용히 실패합니다',
    suggestion: '.exceptionally() 또는 .handle()을 체인 끝에 추가하여 예외를 처리하세요. 최소한 로깅이라도 해야 디버깅이 가능합니다',
    portfolioValue: 7,
    keywords: ['CompletableFuture', 'exceptionally', 'handle', '에러 처리'],
  });
}

/** @Scheduled 메서드에 try-catch 없음 → 예외 시 스케줄 죽음 */
function detectScheduledWithoutErrorHandling(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Find @Scheduled methods
  const pattern = /@Scheduled\b[\s\S]*?(?:public|protected|private)\s+void\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match[0].length > 400) continue;

    // Find the method body — look for the matching closing brace
    const methodStart = match.index + match[0].length;
    const methodBody = extractMethodBody(content, methodStart);
    if (!methodBody) continue;

    // Check if the method body has try-catch
    if (/\btry\s*\{/.test(methodBody)) continue;

    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'scheduled-no-error-handling',
      severity: 'high',
      file: filePath,
      line,
      current: `@Scheduled 메서드 '${match[1]}'에 try-catch가 없습니다. 예외 발생 시 해당 스케줄이 더 이상 실행되지 않을 수 있습니다`,
      suggestion: '메서드 전체를 try-catch로 감싸고 예외를 로깅하세요. @Scheduled에서 미처리 예외가 발생하면 ScheduledExecutorService가 해당 태스크를 영구 중단합니다',
      portfolioValue: 9,
      keywords: ['@Scheduled', 'try-catch', '스케줄러', '예외 처리'],
    });
  }
}

/** 여러 @Scheduled가 있는데 스레드풀 설정 없음 */
function detectScheduledSingleThread(
  filePath: string,
  _content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  if (context.scheduledMethodCount < 2 || context.hasSchedulingConfig) return;

  // Only report once — skip if this isn't the first file processed
  // We use a simple heuristic: only report on files that have @Scheduled
  if (!_content.includes('@Scheduled')) return;

  // Only report from the first @Scheduled file to avoid duplicates
  const scheduledClasses = [...context.asyncMethods.entries()]
    .filter(([_, methods]) => methods.some(m => m.startsWith('scheduled:')));
  if (scheduledClasses.length > 0 && !filePath.includes(scheduledClasses[0][0])) return;

  opportunities.push({
    type: 'scheduled-single-thread',
    severity: 'medium',
    file: filePath,
    current: `@Scheduled 메서드가 ${context.scheduledMethodCount}개인데 커스텀 TaskScheduler 설정이 없습니다. 기본 단일 스레드로 실행되어 하나가 지연되면 모두 밀립니다`,
    suggestion: 'ThreadPoolTaskScheduler Bean을 등록하고 poolSize를 @Scheduled 메서드 수 이상으로 설정하세요. 또는 SchedulingConfigurer를 구현하세요',
    portfolioValue: 7,
    keywords: ['@Scheduled', 'ThreadPoolTaskScheduler', 'SchedulingConfigurer', '스레드 풀'],
  });
}

/** @EventListener에서 blocking 작업 */
function detectEventListenerBlocking(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Find @EventListener methods
  const pattern = /@EventListener\b[\s\S]*?(?:public|protected|private)\s+\w+\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match[0].length > 400) continue;

    // Already @Async → skip (user intentionally made it async)
    const preceding = content.substring(Math.max(0, match.index - 100), match.index);
    if (/@Async/.test(preceding)) continue;

    const methodStart = match.index + match[0].length;
    const methodBody = extractMethodBody(content, methodStart);
    if (!methodBody) continue;

    // Check for blocking operations
    const blockingPatterns = [
      /restTemplate\.\w+\s*\(/,
      /\.block\s*\(\s*\)/,
      /Thread\.sleep\s*\(/,
      /\.send\s*\(/,
      /\.execute\s*\(/,
      /repository\.\w+\s*\(/i,
      /jdbcTemplate\.\w+\s*\(/,
    ];

    const hasBlocking = blockingPatterns.some(p => p.test(methodBody));
    if (!hasBlocking) continue;

    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'event-listener-blocking',
      severity: 'medium',
      file: filePath,
      line,
      current: `@EventListener 메서드 '${match[1]}'에서 블로킹 작업(외부 호출/DB)을 수행합니다. 이벤트 발행자 스레드를 차단하여 성능이 저하됩니다`,
      suggestion: '@EventListener 대신 @Async @EventListener를 사용하거나, ApplicationEventPublisher로 비동기 처리하세요',
      portfolioValue: 7,
      keywords: ['@EventListener', '@Async', '비동기 이벤트', '블로킹'],
    });
  }
}

/** ThreadLocal set/get은 있는데 remove() 없음 → 메모리 누수 */
function detectThreadLocalWithoutCleanup(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Check for @RequestScope — Spring manages lifecycle
  if (/@RequestScope/.test(content)) return;

  // Detect ThreadLocal field declarations
  const hasThreadLocal = /(?:private|protected|public)\s+(?:static\s+)?(?:final\s+)?ThreadLocal\b/.test(content);
  if (!hasThreadLocal) return;

  // Check for usage (.set or .get)
  const hasUsage = /\.set\s*\(|\.get\s*\(/.test(content);
  if (!hasUsage) return;

  // Check for .remove()
  const hasRemove = /\.remove\s*\(\s*\)/.test(content);
  if (hasRemove) return;

  opportunities.push({
    type: 'threadlocal-no-cleanup',
    severity: 'high',
    file: filePath,
    current: 'ThreadLocal을 사용하지만 remove()를 호출하지 않습니다. 스레드 풀 환경에서 이전 요청의 데이터가 다음 요청에 누출되고 메모리 누수가 발생합니다',
    suggestion: 'try-finally 블록에서 ThreadLocal.remove()를 반드시 호출하세요. 또는 Spring의 RequestContextHolder나 @RequestScope Bean을 사용하세요',
    portfolioValue: 9,
    keywords: ['ThreadLocal', 'remove()', '메모리 누수', '스레드 풀'],
  });
}

/** Mono/Flux 체인 내에서 .block() 또는 동기 I/O 호출 */
function detectBlockingInReactiveChain(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  if (!context.isReactiveProject) return;
  if (!content.includes('Mono') && !content.includes('Flux')) return;

  // Detect .block() calls in reactive code
  const blockPattern = /\.block\s*\(\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(content)) !== null) {
    // Skip if in a test file (already filtered above, but double-check)
    const preceding = content.substring(Math.max(0, match.index - 500), match.index);

    // Skip if wrapped in a Schedulers.boundedElastic() context
    if (/subscribeOn\s*\(\s*Schedulers\.boundedElastic\s*\(\s*\)\s*\)/.test(preceding)) continue;

    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'blocking-in-reactive',
      severity: 'high',
      file: filePath,
      line,
      current: '리액티브 체인에서 .block()을 호출하고 있습니다. Netty 이벤트 루프 스레드를 블로킹하여 전체 서버 처리량이 급감합니다',
      suggestion: '.block() 대신 flatMap/map으로 리액티브 체인을 이어가세요. 불가피하면 subscribeOn(Schedulers.boundedElastic())으로 별도 스레드에서 실행하세요',
      portfolioValue: 10,
      keywords: ['WebFlux', 'Mono', 'Flux', '.block()', '리액티브'],
    });
    break;
  }

  // Detect synchronous I/O in Mono/Flux chains
  const reactiveMethodPattern = /(?:Mono|Flux)\s*\.[\s\S]*?(?:map|flatMap|doOnNext)\s*\(/g;
  while ((match = reactiveMethodPattern.exec(content)) !== null) {
    const chainBody = content.substring(match.index, Math.min(content.length, match.index + 500));

    const hasSyncIO = /(?:restTemplate\.\w+|jdbcTemplate\.\w+|Thread\.sleep|\.openConnection)/.test(chainBody);
    if (!hasSyncIO) continue;

    const line = content.substring(0, match.index).split('\n').length;

    opportunities.push({
      type: 'blocking-in-reactive',
      severity: 'high',
      file: filePath,
      line,
      current: '리액티브 체인 내에서 동기 I/O(RestTemplate, JDBC 등)를 호출하고 있습니다',
      suggestion: 'WebClient(비동기 HTTP)와 R2DBC(비동기 DB)를 사용하세요. 동기 라이브러리를 써야 하면 Schedulers.boundedElastic()에서 실행하세요',
      portfolioValue: 10,
      keywords: ['WebFlux', '리액티브', 'blocking I/O', 'WebClient', 'R2DBC'],
    });
    break;
  }
}

/** 싱글톤에서 volatile 없는 lazy init → double-checked locking 실패 */
function detectUnsafeLazyInit(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isSingleton = /@(?:Service|Component|Controller|RestController|Repository|Configuration)\b/.test(content);
  if (!isSingleton) return;

  // Detect lazy initialization pattern: private SomeType field; ... if (field == null) { field = ... }
  const lazyPattern = /private\s+(?!volatile\b)(?!final\b)(?!static\b)(\w+(?:<[^>]*>)?)\s+(\w+)\s*;/g;
  let fieldMatch: RegExpExecArray | null;

  while ((fieldMatch = lazyPattern.exec(content)) !== null) {
    const fieldType = fieldMatch[1];
    const fieldName = fieldMatch[2];

    // Skip primitive types, DI annotations
    if (/^(?:int|long|boolean|byte|short|char|float|double|String)$/.test(fieldType)) continue;
    const fieldPreceding = content.substring(Math.max(0, fieldMatch.index - 80), fieldMatch.index);
    if (/@(?:Autowired|Value|Inject|Resource)/.test(fieldPreceding)) continue;

    // Check for null-check lazy init pattern
    const nullCheckPattern = new RegExp(
      `if\\s*\\(\\s*(?:this\\.)?${fieldName}\\s*==\\s*null\\s*\\)[\\s\\S]{0,200}?${fieldName}\\s*=`,
    );
    if (!nullCheckPattern.test(content)) continue;

    // Check for synchronized block around the null check
    const syncPattern = new RegExp(
      `synchronized\\s*\\([^)]*\\)[\\s\\S]{0,100}?if\\s*\\(\\s*(?:this\\.)?${fieldName}\\s*==\\s*null`,
    );
    const hasSynchronized = syncPattern.test(content);

    // If synchronized but field is not volatile → double-checked locking bug
    // If not synchronized → basic race condition
    const line = content.substring(0, fieldMatch.index).split('\n').length;

    opportunities.push({
      type: 'unsafe-lazy-init',
      severity: 'high',
      file: filePath,
      line,
      current: hasSynchronized
        ? `필드 '${fieldName}'에 volatile 없이 double-checked locking을 사용합니다. 다른 스레드가 부분 초기화된 객체를 볼 수 있습니다`
        : `필드 '${fieldName}'에 동기화 없이 lazy initialization을 합니다. 여러 스레드가 동시에 초기화할 수 있습니다`,
      suggestion: hasSynchronized
        ? `'${fieldName}' 필드에 volatile 키워드를 추가하세요. 또는 @PostConstruct에서 즉시 초기화하거나 Holder 패턴을 사용하세요`
        : `@PostConstruct에서 초기화하거나, volatile + synchronized(double-checked locking)를 사용하세요`,
      portfolioValue: 8,
      keywords: ['volatile', 'Double-Checked Locking', 'Lazy Init', '멀티스레드'],
    });
  }
}

/** Extract a rough method body by counting braces from the opening { */
function extractMethodBody(content: string, startIndex: number): string | null {
  let depth = 1;
  let i = startIndex;
  const maxLen = Math.min(content.length, startIndex + 2000);

  while (i < maxLen && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }

  if (depth !== 0) return null;
  return content.substring(startIndex, i - 1);
}
