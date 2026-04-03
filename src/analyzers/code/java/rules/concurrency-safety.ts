import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeConcurrencySafety(
  filePath: string,
  content: string,
  _context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  // Skip test files
  if (filePath.includes('/test/') || filePath.includes('/tests/')) return opportunities;

  detectMutableSingletonState(filePath, content, opportunities);
  detectSyncExternalCall(filePath, content, opportunities);
  detectUnsafeSharedAccess(filePath, content, opportunities);

  return opportunities;
}

function detectMutableSingletonState(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Spring @Service, @Component, @Controller are singletons by default
  const isSingleton = /@(?:Service|Component|Controller|RestController|Repository)\b/.test(content);
  if (!isSingleton) return;

  // Detect mutable instance fields (not final, not static final)
  // Patterns: "private List<..> field", "private Map<..> field", "private int count"
  const mutableFieldPatterns = [
    // Collection fields without final
    /private\s+(?!final\b)(?:List|Map|Set|Collection|ArrayList|HashMap|HashSet|ConcurrentHashMap)<[^>]*>\s+\w+/g,
    // Primitive/wrapper mutable counters
    /private\s+(?!final\b)(?:int|long|boolean|Integer|Long|Boolean|AtomicInteger|AtomicLong)\s+\w+/g,
  ];

  const mutableFields: string[] = [];
  for (const pattern of mutableFieldPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const m of matches) {
        // Exclude fields annotated with @Autowired, @Value, @Inject (DI fields)
        const fieldStart = content.indexOf(m);
        const preceding = content.substring(Math.max(0, fieldStart - 100), fieldStart);
        if (/@Autowired|@Value|@Inject|@Resource/.test(preceding)) continue;

        // Extract field name
        const nameMatch = m.match(/\s(\w+)$/);
        if (nameMatch) mutableFields.push(nameMatch[1]);
      }
    }
  }

  if (mutableFields.length === 0) return;

  // Check if any mutable field is written to in methods (not just constructor)
  let writtenFields = 0;
  for (const field of mutableFields) {
    // field = ..., field.add(), field.put(), field.clear(), field++, ++field
    const writePattern = new RegExp(
      `(?:this\\.)?${field}\\s*(?:=|\\.|\\+\\+|--|\\+=|-=)(?![^{]*?(?:constructor|<init>))`,
    );
    if (writePattern.test(content)) {
      writtenFields++;
    }
  }

  if (writtenFields > 0) {
    opportunities.push({
      type: 'mutable-singleton-state',
      severity: 'high',
      file: filePath,
      current: `싱글톤 Bean에 변경 가능한 인스턴스 필드 ${writtenFields}개가 메서드에서 수정됩니다 (race condition 위험)`,
      suggestion: '싱글톤 Bean의 상태는 불변이어야 합니다. ConcurrentHashMap, AtomicReference, 또는 ThreadLocal을 사용하거나, 상태를 요청 스코프 Bean으로 분리하세요',
      portfolioValue: 10,
      keywords: ['Thread Safety', '동시성', '싱글톤 패턴', 'Race Condition'],
    });
  }
}

function detectSyncExternalCall(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  // Detect synchronous external API calls (RestTemplate, WebClient.block(), HttpClient)
  const syncCallPatterns = [
    /restTemplate\.(?:getForObject|getForEntity|postForObject|postForEntity|exchange)\s*\(/g,
    /\.block\s*\(\s*\)/g,
    /HttpClient\.newHttpClient\(\)[\s\S]*?\.send\s*\(/g,
    /new\s+URL\s*\([^)]+\)\.openConnection\s*\(/g,
  ];

  let syncCallCount = 0;
  for (const pattern of syncCallPatterns) {
    const matches = content.match(pattern);
    if (matches) syncCallCount += matches.length;
  }

  if (syncCallCount === 0) return;

  // Check if @Async is used
  const hasAsync = /@Async/.test(content);
  const hasCompletableFuture = /CompletableFuture/.test(content);

  if (!hasAsync && !hasCompletableFuture) {
    opportunities.push({
      type: 'sync-external-call',
      severity: 'high',
      file: filePath,
      current: `외부 API를 동기 방식으로 호출하는 곳이 ${syncCallCount}개 있습니다 (스레드 블로킹)`,
      suggestion: '@Async + CompletableFuture 또는 WebClient(논블로킹)를 사용하세요. 동기 호출은 스레드 풀을 고갈시켜 전체 서비스 장애로 이어질 수 있습니다',
      portfolioValue: 9,
      keywords: ['비동기 처리', '@Async', 'CompletableFuture', 'Thread Pool'],
    });
  }
}

function detectUnsafeSharedAccess(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Detect SimpleDateFormat (not thread-safe, common mistake)
  const simpleDateFormat = /new\s+SimpleDateFormat\s*\(/.test(content);
  const isFieldLevel = /(?:private|protected)\s+(?:static\s+)?SimpleDateFormat/.test(content);

  if (simpleDateFormat && isFieldLevel) {
    opportunities.push({
      type: 'unsafe-shared-resource',
      severity: 'high',
      file: filePath,
      current: 'SimpleDateFormat을 필드로 공유하고 있습니다 (thread-unsafe)',
      suggestion: 'DateTimeFormatter(thread-safe) 또는 ThreadLocal<SimpleDateFormat>을 사용하세요. SimpleDateFormat은 내부 Calendar를 공유하여 동시 접근 시 데이터 손상이 발생합니다',
      portfolioValue: 8,
      keywords: ['Thread Safety', 'SimpleDateFormat', 'DateTimeFormatter', '동시성 버그'],
    });
    return;
  }

  // Detect HashMap used as shared cache (should be ConcurrentHashMap)
  const hasSharedHashMap = /private\s+(?:static\s+)?(?:final\s+)?Map\s*<[^>]*>\s+\w+\s*=\s*new\s+HashMap/.test(content);
  const isSingleton = /@(?:Service|Component|Controller|RestController)\b/.test(content);

  if (hasSharedHashMap && isSingleton) {
    opportunities.push({
      type: 'unsafe-shared-resource',
      severity: 'high',
      file: filePath,
      current: '싱글톤 Bean에서 HashMap을 공유 캐시/상태로 사용하고 있습니다',
      suggestion: 'ConcurrentHashMap 또는 Collections.synchronizedMap()으로 교체하세요. HashMap은 동시 접근 시 무한 루프나 데이터 손실이 발생할 수 있습니다',
      portfolioValue: 9,
      keywords: ['ConcurrentHashMap', 'Thread Safety', '동시성', '공유 자원'],
    });
  }
}
