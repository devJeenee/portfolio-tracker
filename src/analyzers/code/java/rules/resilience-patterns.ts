import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeResiliencePatterns(
  filePath: string,
  content: string,
  _context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  // Skip test files
  if (filePath.includes('/test/') || filePath.includes('/tests/')) return opportunities;

  detectMissingCircuitBreaker(filePath, content, opportunities);
  detectMissingTimeout(filePath, content, opportunities);
  detectMissingRetry(filePath, content, opportunities);
  detectMissingFallback(filePath, content, opportunities);

  return opportunities;
}

function detectMissingCircuitBreaker(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  // Check if this service calls external APIs
  const hasExternalCall =
    /restTemplate\.|webClient\.|feignClient|@FeignClient|HttpClient|\.exchange\s*\(/.test(content);
  if (!hasExternalCall) return;

  // Check for circuit breaker annotations/patterns
  const hasCircuitBreaker =
    /@CircuitBreaker|@Retry|CircuitBreakerFactory|Resilience4j|HystrixCommand|@HystrixCommand/.test(content);

  if (!hasCircuitBreaker) {
    opportunities.push({
      type: 'missing-circuit-breaker',
      severity: 'high',
      file: filePath,
      current: '외부 API 호출에 Circuit Breaker가 없습니다',
      suggestion: 'Resilience4j @CircuitBreaker를 적용하세요. 외부 서비스 장애 시 빠르게 실패(fail-fast)하여 장애 전파를 차단하고, 자원 고갈을 방지합니다',
      portfolioValue: 10,
      keywords: ['Circuit Breaker', 'Resilience4j', '장애 격리', 'Fault Tolerance'],
    });
  }
}

function detectMissingTimeout(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Check for HTTP client usage without timeout configuration
  const restTemplateUsage = /new\s+RestTemplate\s*\(\s*\)/.test(content);
  const webClientUsage = /WebClient\.(?:create|builder)\s*\(/.test(content);

  if (!restTemplateUsage && !webClientUsage) return;

  // Check if timeout is configured
  const hasTimeout =
    /[Tt]imeout|connectTimeout|readTimeout|responseTimeout|\.timeout\s*\(/.test(content);

  if (!hasTimeout) {
    const clientType = restTemplateUsage ? 'RestTemplate' : 'WebClient';
    opportunities.push({
      type: 'missing-timeout',
      severity: 'high',
      file: filePath,
      current: `${clientType}에 타임아웃이 설정되지 않았습니다`,
      suggestion: 'connectTimeout(3초)과 readTimeout(5초)을 반드시 설정하세요. 타임아웃 없이는 외부 서비스 지연이 스레드 풀 전체를 블로킹하여 서비스 전체 장애로 이어집니다',
      portfolioValue: 9,
      keywords: ['Timeout', '장애 대응', 'Connection Pool', '가용성'],
    });
  }
}

function detectMissingRetry(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  // Check for external calls
  const hasExternalCall =
    /restTemplate\.|webClient\.|\.exchange\s*\(|\.retrieve\s*\(/.test(content);
  if (!hasExternalCall) return;

  // Check for retry patterns
  const hasRetry =
    /@Retry|@Retryable|RetryTemplate|\.retry\s*\(|Resilience4j|backoff/.test(content);

  // Check for manual retry loops (also acceptable)
  const hasManualRetry = /for\s*\([^)]*retry|while\s*\([^)]*attempt|maxRetries|retryCount/.test(content);

  if (!hasRetry && !hasManualRetry) {
    opportunities.push({
      type: 'missing-retry',
      severity: 'medium',
      file: filePath,
      current: '외부 호출에 재시도(Retry) 로직이 없습니다',
      suggestion: '@Retryable(maxAttempts=3, backoff=@Backoff) 또는 Resilience4j @Retry를 적용하세요. 일시적 네트워크 오류를 자동 복구하여 가용성을 높입니다',
      portfolioValue: 7,
      keywords: ['Retry', 'Exponential Backoff', 'Resilience4j', '가용성'],
    });
  }
}

function detectMissingFallback(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Check for Feign clients without fallback
  const feignPattern = /@FeignClient\s*\(/;
  if (!feignPattern.test(content)) return;

  const hasFallback = /fallback\s*=|fallbackFactory\s*=/.test(content);

  if (!hasFallback) {
    opportunities.push({
      type: 'missing-fallback',
      severity: 'medium',
      file: filePath,
      current: '@FeignClient에 fallback이 정의되지 않았습니다',
      suggestion: 'fallback 또는 fallbackFactory를 구현하세요. 외부 서비스 장애 시 기본값/캐시 데이터를 반환하여 사용자 경험을 유지할 수 있습니다',
      portfolioValue: 8,
      keywords: ['Fallback', 'Feign', '우아한 저하', 'Graceful Degradation'],
    });
  }
}
