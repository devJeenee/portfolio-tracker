import type { JavaProjectContext } from '../base-analyzer.js';
import type { SpringConventions } from '../../../config/conventions.js';

export interface ProjectStrength {
  category: string;
  title: string;
  description: string;
  portfolioValue: number;
  keywords: string[];
}

export function detectStrengths(
  context: JavaProjectContext,
  conventions: SpringConventions,
  fileContents: Map<string, string>,
  allFiles: string[] = [],
): ProjectStrength[] {
  const strengths: ProjectStrength[] = [];

  detectArchitectureStrengths(context, fileContents, strengths);
  detectTestingStrengths(context, strengths);
  detectSecurityStrengths(context, fileContents, strengths);
  detectPatternStrengths(context, fileContents, strengths);
  detectInfraStrengths(fileContents, allFiles, strengths);

  return strengths.sort((a, b) => b.portfolioValue - a.portfolioValue);
}

function detectArchitectureStrengths(
  context: JavaProjectContext,
  fileContents: Map<string, string>,
  strengths: ProjectStrength[],
): void {
  // Proper layered architecture
  let hasControllers = false;
  for (const [, content] of fileContents) {
    if (/@(?:Rest)?Controller\b/.test(content)) { hasControllers = true; break; }
  }
  const hasServices = context.serviceClasses.length > 0;
  const hasRepositories = context.repositoryInterfaces.length > 0;
  const hasEntities = context.entityClasses.length > 0;

  if (hasControllers && hasServices && hasRepositories && hasEntities) {
    strengths.push({
      category: '아키텍처',
      title: '레이어드 아키텍처 구현',
      description: `Controller → Service(${context.serviceClasses.length}개) → Repository(${context.repositoryInterfaces.length}개) → Entity(${context.entityClasses.length}개) 4계층 구조가 갖춰져 있습니다`,
      portfolioValue: 9,
      keywords: ['레이어드 아키텍처', 'Spring Boot', '관심사 분리'],
    });
  }

  // DTO usage
  if (context.dtoClasses.length >= 3) {
    strengths.push({
      category: '아키텍처',
      title: 'DTO 패턴 적용',
      description: `${context.dtoClasses.length}개의 DTO/Response/Request 클래스가 있습니다. Entity 직접 노출을 방지합니다`,
      portfolioValue: 7,
      keywords: ['DTO 패턴', 'API 설계', '데이터 은닉'],
    });
  }

  // DDD detection
  if (context.architecture.detected === 'ddd') {
    strengths.push({
      category: '아키텍처',
      title: 'DDD(도메인 주도 설계) 구조',
      description: `Domain/Application/Infrastructure 패키지 구조가 감지되었습니다 (신뢰도: ${context.architecture.confidence})`,
      portfolioValue: 10,
      keywords: ['DDD', '도메인 주도 설계', '헥사고날 아키텍처'],
    });
  }
}

function detectTestingStrengths(
  context: JavaProjectContext,
  strengths: ProjectStrength[],
): void {
  const testCount = context.testFileMap.size;

  if (testCount === 0) return;

  const serviceCount = context.serviceClasses.length;
  const coverageRatio = serviceCount > 0 ? testCount / serviceCount : 0;

  if (coverageRatio >= 0.8) {
    strengths.push({
      category: '테스트',
      title: '높은 테스트 커버리지',
      description: `Service ${serviceCount}개 중 ${testCount}개에 대응 테스트가 있습니다 (${Math.round(coverageRatio * 100)}%)`,
      portfolioValue: 9,
      keywords: ['JUnit', 'Mockito', '테스트 커버리지', 'TDD'],
    });
  } else if (testCount >= 3) {
    strengths.push({
      category: '테스트',
      title: '테스트 코드 작성',
      description: `${testCount}개의 테스트 파일이 있습니다`,
      portfolioValue: 6,
      keywords: ['JUnit', 'Mockito', '단위 테스트'],
    });
  }
}

function detectSecurityStrengths(
  context: JavaProjectContext,
  fileContents: Map<string, string>,
  strengths: ProjectStrength[],
): void {
  if (context.hasSecurityConfig) {
    strengths.push({
      category: '보안',
      title: 'Spring Security 적용',
      description: 'Spring Security 설정이 감지되었습니다. 인증/인가 체계가 구축되어 있습니다',
      portfolioValue: 8,
      keywords: ['Spring Security', '인증', '인가', 'RBAC'],
    });
  }

  // Check for JWT usage
  for (const [, content] of fileContents) {
    if (/Jwt|JWT|JsonWebToken|io\.jsonwebtoken/.test(content)) {
      strengths.push({
        category: '보안',
        title: 'JWT 인증 구현',
        description: 'JWT 기반 인증이 구현되어 있습니다. Stateless 인증으로 확장성을 확보합니다',
        portfolioValue: 8,
        keywords: ['JWT', 'Stateless', '토큰 인증', 'Spring Security'],
      });
      break;
    }
  }
}

function detectPatternStrengths(
  context: JavaProjectContext,
  fileContents: Map<string, string>,
  strengths: ProjectStrength[],
): void {
  if (context.hasControllerAdvice) {
    strengths.push({
      category: '예외 처리',
      title: '글로벌 예외 처리 (@ControllerAdvice)',
      description: `@ControllerAdvice가 구현되어 있고, ${context.globalExceptionTypes.length}개 예외 타입을 처리합니다`,
      portfolioValue: 8,
      keywords: ['@ControllerAdvice', '글로벌 예외 처리', '일관된 에러 응답'],
    });
  }

  // Check for various good patterns across files
  let hasSwagger = false;
  let hasCaching = false;
  let hasCircuitBreaker = false;
  let hasAsyncProcessing = false;
  let hasValidation = false;

  for (const [, content] of fileContents) {
    if (/@Operation|@Api|springdoc|swagger/.test(content)) hasSwagger = true;
    if (/@Cacheable|@CacheEvict|CacheManager/.test(content)) hasCaching = true;
    if (/@CircuitBreaker|Resilience4j|@Retry/.test(content)) hasCircuitBreaker = true;
    if (/@Async|CompletableFuture/.test(content)) hasAsyncProcessing = true;
    if (/@Valid\b/.test(content)) hasValidation = true;
  }

  if (hasSwagger) {
    strengths.push({
      category: 'API 설계',
      title: 'API 문서화 (Swagger/OpenAPI)',
      description: 'Swagger/OpenAPI를 통한 API 문서가 자동 생성됩니다',
      portfolioValue: 7,
      keywords: ['Swagger', 'OpenAPI', 'API 문서화'],
    });
  }

  if (hasCaching) {
    strengths.push({
      category: '성능',
      title: '캐싱 전략 적용',
      description: 'Spring Cache(@Cacheable/@CacheEvict)가 적용되어 있습니다',
      portfolioValue: 8,
      keywords: ['Spring Cache', '캐싱', '성능 최적화'],
    });
  }

  if (hasCircuitBreaker) {
    strengths.push({
      category: '장애 대응',
      title: 'Circuit Breaker 패턴 적용',
      description: 'Resilience4j 또는 Circuit Breaker가 적용되어 외부 서비스 장애에 대비합니다',
      portfolioValue: 9,
      keywords: ['Circuit Breaker', 'Resilience4j', '장애 격리'],
    });
  }

  if (hasAsyncProcessing) {
    strengths.push({
      category: '성능',
      title: '비동기 처리 구현',
      description: '@Async 또는 CompletableFuture로 비동기 처리가 구현되어 있습니다',
      portfolioValue: 7,
      keywords: ['비동기', '@Async', 'CompletableFuture'],
    });
  }

  if (hasValidation) {
    strengths.push({
      category: 'API 설계',
      title: 'Bean Validation 적용',
      description: '@Valid를 사용한 입력 검증이 구현되어 있습니다',
      portfolioValue: 6,
      keywords: ['Bean Validation', '@Valid', '입력 검증'],
    });
  }
}

function detectInfraStrengths(
  fileContents: Map<string, string>,
  allFiles: string[],
  strengths: ProjectStrength[],
): void {
  let hasFlyway = false;
  let hasDocker = false;
  let hasActuator = false;
  let hasMetrics = false;

  // Check file paths from allFiles for Docker/Flyway (not limited to java/kt)
  for (const filePath of allFiles) {
    if (/Dockerfile|docker-compose/.test(filePath)) hasDocker = true;
    if (/V\d+__/.test(filePath)) hasFlyway = true;
  }

  for (const [, content] of fileContents) {
    if (/flyway|liquibase/.test(content)) hasFlyway = true;
    if (/actuator|HealthIndicator/.test(content)) hasActuator = true;
    if (/@Timed|MeterRegistry|Micrometer/.test(content)) hasMetrics = true;
  }

  if (hasFlyway) {
    strengths.push({
      category: 'DevOps',
      title: 'DB 마이그레이션 관리',
      description: 'Flyway/Liquibase로 DB 스키마를 버전 관리합니다',
      portfolioValue: 7,
      keywords: ['Flyway', 'DB 마이그레이션', '스키마 관리'],
    });
  }

  if (hasDocker) {
    strengths.push({
      category: 'DevOps',
      title: 'Docker 컨테이너화',
      description: 'Docker를 통한 컨테이너화가 구현되어 있습니다',
      portfolioValue: 7,
      keywords: ['Docker', '컨테이너', 'DevOps'],
    });
  }

  if (hasActuator) {
    strengths.push({
      category: '관측성',
      title: 'Spring Boot Actuator 적용',
      description: 'Actuator/HealthIndicator로 애플리케이션 상태를 모니터링합니다',
      portfolioValue: 7,
      keywords: ['Actuator', 'Health Check', '모니터링'],
    });
  }

  if (hasMetrics) {
    strengths.push({
      category: '관측성',
      title: '커스텀 메트릭 수집',
      description: 'Micrometer를 통한 커스텀 메트릭이 수집됩니다',
      portfolioValue: 8,
      keywords: ['Micrometer', 'Prometheus', 'Grafana'],
    });
  }
}
