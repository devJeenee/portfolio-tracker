import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeObservabilityPatterns(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  // Skip test files
  if (filePath.includes('/test/') || filePath.includes('/tests/')) return opportunities;

  detectMissingCustomMetrics(filePath, content, opportunities);
  detectMissingRequestTracing(filePath, content, opportunities);
  detectMissingHealthIndicator(filePath, content, context, opportunities);
  detectUnstructuredLogging(filePath, content, opportunities);

  return opportunities;
}

function detectMissingCustomMetrics(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  // Check for business-critical operations that should be metered
  const hasBusinessOps =
    /\.save\(|\.delete\(|\.sendMessage\(|\.processPayment\(|\.createOrder\(|\.transfer\(/.test(content);
  if (!hasBusinessOps) return;

  // Check for Micrometer metrics
  const hasMetrics =
    /@Timed|@Counted|MeterRegistry|Counter\.|Timer\.|Gauge\.|DistributionSummary|micrometer/.test(content);

  if (!hasMetrics) {
    opportunities.push({
      type: 'missing-custom-metrics',
      severity: 'medium',
      file: filePath,
      current: '비즈니스 핵심 연산에 커스텀 메트릭이 없습니다',
      suggestion: 'Micrometer @Timed/@Counted를 적용하여 처리량, 지연시간, 에러율을 모니터링하세요. Grafana 대시보드와 알림으로 장애를 사전에 감지할 수 있습니다',
      portfolioValue: 8,
      keywords: ['Micrometer', 'Prometheus', 'Grafana', '모니터링'],
    });
  }
}

function detectMissingRequestTracing(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  // Check for MDC (Mapped Diagnostic Context) or tracing headers
  const hasTracing =
    /MDC\.put|@Traced|Span\.|Tracer\.|traceId|correlationId|X-Request-Id|requestId|Micrometer.*Observation/.test(content);

  // Check if a filter/interceptor exists (may be configured elsewhere)
  const hasTracingFilter = /TracingFilter|RequestIdFilter|CorrelationIdFilter|OncePerRequestFilter/.test(content);

  if (!hasTracing && !hasTracingFilter) {
    // Only report on main controllers (not every controller)
    const endpoints = content.match(/@(?:Get|Post|Put|Delete|Patch)Mapping/g);
    if (!endpoints || endpoints.length < 2) return;

    opportunities.push({
      type: 'missing-request-tracing',
      severity: 'medium',
      file: filePath,
      current: '요청 추적(traceId/correlationId)이 설정되지 않았습니다',
      suggestion: 'MDC 기반 요청 ID를 추가하거나 Micrometer Tracing(구 Spring Cloud Sleuth)을 도입하세요. 분산 환경에서 로그 추적이 가능해져 디버깅 시간을 대폭 단축합니다',
      portfolioValue: 8,
      keywords: ['분산 추적', 'MDC', 'Micrometer Tracing', 'Observability'],
    });
  }
}

function detectMissingHealthIndicator(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  // Only check main application class
  const isMainApp = /@SpringBootApplication/.test(content);
  if (!isMainApp) return;

  // Check if project has external dependencies that need health checks
  const hasExternalDeps = context.repositoryInterfaces.length > 0 ||
    context.serviceClasses.some(s =>
      s.includes('Client') || s.includes('Gateway') || s.includes('Adapter'),
    );

  if (!hasExternalDeps) return;

  // Check for custom HealthIndicator
  const allFiles = [...context.testFileMap.entries()];
  // This is a simplified check — we only have the main class context here
  const hasHealthIndicator = /HealthIndicator|AbstractHealthIndicator|Health\.up|actuator/.test(content);

  if (!hasHealthIndicator) {
    opportunities.push({
      type: 'missing-health-check',
      severity: 'medium',
      file: filePath,
      current: '외부 의존성이 있지만 커스텀 HealthIndicator가 없습니다',
      suggestion: 'Spring Boot Actuator의 커스텀 HealthIndicator를 구현하여 DB, 외부 API, 메시지 큐 등의 상태를 모니터링하세요. K8s liveness/readiness probe에도 활용됩니다',
      portfolioValue: 7,
      keywords: ['Actuator', 'Health Check', 'Kubernetes', 'Observability'],
    });
  }
}

function detectUnstructuredLogging(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  const isController = /@(Rest)?Controller/.test(content);
  if (!isService && !isController) return;

  // Check for string concatenation in log statements (bad practice)
  const concatLogs = content.match(
    /log(?:ger)?\.(?:info|debug|warn|error)\s*\(\s*"[^"]*"\s*\+\s*/g,
  );

  if (concatLogs && concatLogs.length >= 3) {
    opportunities.push({
      type: 'unstructured-logging',
      severity: 'low',
      file: filePath,
      current: `문자열 결합 방식의 로그가 ${concatLogs.length}개 있습니다`,
      suggestion: 'SLF4J 플레이스홀더 log.info("user={}", userId)를 사용하세요. 로그 레벨이 꺼져 있을 때 불필요한 문자열 결합 비용을 방지하고, 구조화 로깅(JSON)으로 전환이 쉬워집니다',
      portfolioValue: 5,
      keywords: ['구조화 로깅', 'SLF4J', 'Logback', 'ELK Stack'],
    });
  }
}
