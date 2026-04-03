import type { ProjectStats } from '../../types/index.js';
import type { CodeOpportunity, GitStory } from '../../types/analysis.js';
import type { RankedOpportunity } from '../../types/analysis.js';

export function scoreOpportunities(
  opportunities: CodeOpportunity[],
  stories: GitStory[],
  stats: ProjectStats,
): RankedOpportunity[] {
  const scored = opportunities.map(opp => {
    const difficultyScore = estimateDifficulty(opp);
    const narrativeValue = generateExpectedNarrative(opp);

    return {
      type: opp.type,
      title: `${opp.type}: ${opp.current.substring(0, 60)}`,
      portfolioValue: opp.portfolioValue,
      expectedNarrative: narrativeValue,
      difficulty: difficultyScore,
      estimatedFiles: estimateFileCount(opp),
    };
  });

  scored.sort((a, b) => {
    const diffOrder: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
    const valueRatio = (b.portfolioValue / diffOrder[b.difficulty]) -
                       (a.portfolioValue / diffOrder[a.difficulty]);
    return valueRatio;
  });

  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

function estimateDifficulty(opp: CodeOpportunity): 'easy' | 'medium' | 'hard' {
  const easyTypes = new Set([
    'missing-validation',
    'readonly-transaction',
    'missing-status-code',
    'sensitive-logging',
    'select-star',
    'like-leading-wildcard',
    'missing-cache-annotation',
    'unstructured-logging',
    'missing-retry',
    'missing-graceful-shutdown',
  ]);
  const hardTypes = new Set([
    'n-plus-one',
    'architecture',
    'god-service',
    'circular-dependency',
    'missing-service-layer',
    'sql-injection',
    'reverse-dependency',
    'domain-external-dependency',
    'anemic-domain-model',
    'mutable-singleton-state',
    'missing-circuit-breaker',
    'sync-external-call',
  ]);

  if (easyTypes.has(opp.type)) return 'easy';
  if (hardTypes.has(opp.type)) return 'hard';
  return 'medium';
}

function estimateFileCount(opp: CodeOpportunity): number {
  const fileCountMap: Record<string, number> = {
    'fat-controller': 3,
    'no-dto': 4,
    'n-plus-one': 2,
    // Transaction patterns
    'missing-transactional': 1,
    'readonly-transaction': 1,
    'controller-transaction': 2,
    // Security patterns
    'hardcoded-secret': 2,
    'sql-injection': 2,
    'sensitive-logging': 1,
    'missing-auth': 3,
    // Layer architecture
    'missing-service-layer': 3,
    'god-service': 5,
    'circular-dependency': 4,
    // Test coverage
    'missing-service-test': 2,
    'missing-controller-test': 2,
    'missing-integration-test': 3,
    // API design
    'missing-pagination': 2,
    'inconsistent-response': 3,
    'missing-status-code': 1,
    // Architecture conformance
    'reverse-dependency': 3,
    'wrong-layer-placement': 1,
    'layer-skip-violation': 3,
    'anemic-domain-model': 4,
    'domain-external-dependency': 3,
    'aggregate-boundary-violation': 2,
    // Query optimization
    'select-star': 1,
    'like-leading-wildcard': 2,
    'findall-without-pagination': 2,
    'missing-index-hint': 2,
    // Caching patterns
    'missing-cache-annotation': 1,
    'cacheable-candidate': 3,
    'distributed-cache-candidate': 4,
    // Concurrency safety
    'mutable-singleton-state': 2,
    'sync-external-call': 3,
    'unsafe-shared-resource': 1,
    // Resilience patterns
    'missing-circuit-breaker': 4,
    'missing-timeout': 2,
    'missing-retry': 2,
    'missing-fallback': 2,
    // Observability patterns
    'missing-custom-metrics': 3,
    'missing-request-tracing': 2,
    'missing-health-check': 2,
    'unstructured-logging': 1,
    // Production readiness
    'missing-api-docs': 2,
    'missing-db-migration': 3,
    'missing-cors-config': 1,
    'missing-rate-limiting': 3,
    'missing-graceful-shutdown': 1,
  };

  return fileCountMap[opp.type] ?? 1;
}

function generateExpectedNarrative(opp: CodeOpportunity): string {
  const narratives: Record<string, string> = {
    'fat-controller': 'Controller의 비즈니스 로직을 Service 계층으로 분리하여 레이어드 아키텍처를 적용했습니다.',
    'no-dto': 'DTO 패턴을 도입하여 Entity 직접 노출을 방지하고, API 응답을 목적에 맞게 설계했습니다.',
    'n-plus-one': 'N+1 문제를 FETCH JOIN으로 해결하여 쿼리 성능을 대폭 개선했습니다.',
    'raw-exception': '글로벌 예외 처리(@ControllerAdvice)를 구현하여 일관된 에러 응답을 제공합니다.',
    'missing-validation': 'Bean Validation을 적용하여 API 입력 검증을 체계화했습니다.',

    // Transaction patterns
    'missing-transactional': '@Transactional을 적용하여 데이터 정합성을 보장했습니다. 트랜잭션 경계를 명확히 하여 일관된 DB 상태를 유지합니다.',
    'readonly-transaction': '조회 전용 트랜잭션에 readOnly=true를 적용하여 JPA flush 비용을 줄이고 DB 성능을 최적화했습니다.',
    'controller-transaction': '트랜잭션 관리를 Service 계층으로 이동하여 레이어 책임을 명확히 분리했습니다.',

    // Security patterns
    'hardcoded-secret': '하드코딩된 시크릿을 환경 변수로 교체하고, 시크릿 관리 체계를 구축했습니다. 12-Factor App 원칙을 준수합니다.',
    'sql-injection': 'SQL 문자열 결합을 Parameterized Query로 교체하여 SQL Injection 취약점을 제거했습니다.',
    'sensitive-logging': '민감 정보 로깅을 마스킹 처리하여 보안과 개인정보보호 컴플라이언스를 준수했습니다.',
    'missing-auth': '@PreAuthorize를 적용하여 메서드 수준 인가를 구현하고, 무단 접근을 차단했습니다.',

    // Layer architecture
    'missing-service-layer': 'Controller에서 Repository 직접 호출을 제거하고 Service 계층을 도입하여 3-tier 아키텍처를 완성했습니다.',
    'god-service': '비대해진 Service를 도메인별로 분리하여 단일 책임 원칙을 적용하고, 코드 유지보수성을 높였습니다.',
    'circular-dependency': '순환 의존을 이벤트 기반 통신으로 해결하여 모듈 간 결합도를 낮추고 확장성을 확보했습니다.',

    // Test coverage
    'missing-service-test': 'JUnit 5 + Mockito로 Service 단위 테스트를 작성하여 비즈니스 로직의 정확성을 검증합니다.',
    'missing-controller-test': '@WebMvcTest와 MockMvc로 Controller 슬라이스 테스트를 작성하여 API 계약을 검증합니다.',
    'missing-integration-test': '@SpringBootTest 기반 통합 테스트를 구현하여 전체 요청 흐름의 정합성을 보장합니다.',

    // API design
    'missing-pagination': 'Pageable을 적용하여 대량 데이터 조회 시 OOM을 방지하고, 클라이언트 친화적인 API를 설계했습니다.',
    'inconsistent-response': '공통 ApiResponse<T> 래퍼를 도입하여 일관된 응답 형식을 제공하고, 프론트엔드 파싱을 단순화했습니다.',
    'missing-status-code': 'RESTful 규약에 맞는 HTTP 상태 코드(201, 204 등)를 적용하여 API 의미를 명확히 전달합니다.',

    // Architecture conformance
    'reverse-dependency': '역방향 레이어 의존을 제거하고 DIP(의존성 역전 원칙)를 적용하여 클린 아키텍처를 완성했습니다.',
    'wrong-layer-placement': '잘못된 패키지에 위치한 클래스를 올바른 레이어로 이동하여 패키지 구조를 정리했습니다.',
    'layer-skip-violation': '레이어 간 의존 규칙을 준수하도록 리팩토링하여 아키텍처 일관성을 확보했습니다.',
    'anemic-domain-model': '빈약한 도메인 모델에 비즈니스 로직을 캡슐화하여 DDD의 Rich Domain Model을 구현했습니다.',
    'domain-external-dependency': 'Domain 레이어에서 Infrastructure 의존을 제거하고 포트/어댑터 패턴을 적용하여 도메인 순수성을 확보했습니다.',
    'aggregate-boundary-violation': 'Aggregate 간 직접 참조를 ID 참조로 변경하여 도메인 경계를 명확히 하고 결합도를 낮췄습니다.',

    // Query optimization
    'select-star': 'SELECT * 대신 필요한 컬럼만 조회하는 Projection을 적용하여 데이터 전송량을 줄이고 쿼리 성능을 개선했습니다.',
    'like-leading-wildcard': 'LIKE 앞자리 와일드카드를 Full-Text Search로 대체하여 인덱스 활용도를 높이고 검색 성능을 개선했습니다.',
    'findall-without-pagination': 'findAll()에 Pageable을 적용하여 대량 데이터 조회 시 OOM을 방지하고 응답 시간을 개선했습니다.',
    'missing-index-hint': '자주 사용되는 복합 조건에 복합 인덱스를 추가하고 EXPLAIN으로 검증하여 쿼리 성능을 최적화했습니다.',

    // Caching patterns
    'missing-cache-annotation': '데이터 변경 메서드에 @CacheEvict를 추가하여 캐시 일관성을 보장하고, 캐시 불일치 버그를 방지했습니다.',
    'cacheable-candidate': 'Spring Cache(@Cacheable)와 Caffeine을 도입하여 반복 조회를 캐싱하고 DB 부하를 대폭 줄였습니다.',
    'distributed-cache-candidate': 'Redis 분산 캐시를 도입하여 다중 인스턴스 환경에서 캐시 일관성을 보장하고 응답 시간을 개선했습니다.',

    // Concurrency safety
    'mutable-singleton-state': '싱글톤 Bean의 가변 상태를 제거하고 불변 설계로 전환하여 멀티스레드 환경의 race condition을 근본적으로 해결했습니다.',
    'sync-external-call': '외부 API 호출을 @Async + CompletableFuture로 비동기화하여 스레드 풀 고갈을 방지하고 응답 시간을 개선했습니다.',
    'unsafe-shared-resource': 'Thread-unsafe 공유 자원을 ConcurrentHashMap/DateTimeFormatter로 교체하여 동시성 버그를 제거했습니다.',

    // Resilience patterns
    'missing-circuit-breaker': 'Resilience4j Circuit Breaker를 도입하여 외부 서비스 장애 시 fail-fast 전략으로 장애 전파를 차단했습니다.',
    'missing-timeout': 'HTTP 클라이언트에 connectTimeout/readTimeout을 설정하여 외부 서비스 지연으로 인한 스레드 풀 고갈을 방지했습니다.',
    'missing-retry': '@Retryable + Exponential Backoff를 적용하여 일시적 네트워크 오류를 자동 복구하고 서비스 가용성을 높였습니다.',
    'missing-fallback': 'Feign Client에 Fallback을 구현하여 외부 서비스 장애 시에도 기본값/캐시 데이터로 사용자 경험을 유지합니다.',

    // Observability patterns
    'missing-custom-metrics': 'Micrometer 커스텀 메트릭(@Timed, Counter)을 도입하여 비즈니스 핵심 지표를 Grafana 대시보드로 실시간 모니터링합니다.',
    'missing-request-tracing': 'MDC 기반 요청 추적 ID를 구현하여 분산 환경에서 로그 추적이 가능해지고, 장애 디버깅 시간을 대폭 단축했습니다.',
    'missing-health-check': 'Spring Boot Actuator 커스텀 HealthIndicator를 구현하여 외부 의존성 상태를 모니터링하고, K8s probe에 활용합니다.',
    'unstructured-logging': 'SLF4J 플레이스홀더와 구조화 로깅(JSON)을 적용하여 로그 분석 효율을 높이고 ELK 스택 연동을 준비했습니다.',

    // Production readiness
    'missing-api-docs': 'springdoc-openapi를 도입하여 API 문서를 자동 생성하고, Swagger UI로 프론트엔드 팀과의 협업 효율을 높였습니다.',
    'missing-db-migration': 'Flyway를 도입하여 DB 스키마를 버전 관리하고, 팀 전체가 일관된 DB 환경에서 개발할 수 있게 했습니다.',
    'missing-cors-config': 'CORS를 명시적으로 구성하여 프론트엔드 분리 환경에서 안전한 API 통신을 보장합니다.',
    'missing-rate-limiting': 'Bucket4j 기반 Rate Limiting을 구현하여 API 남용과 DDoS 공격을 방어합니다.',
    'missing-graceful-shutdown': 'Graceful Shutdown을 설정하여 배포 시 진행 중인 요청이 안전하게 완료된 후 종료되도록 했습니다.',
  };

  return narratives[opp.type] ?? `${opp.suggestion}을 통해 코드 품질을 개선했습니다.`;
}
