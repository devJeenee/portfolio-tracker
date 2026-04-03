import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeProductionReadiness(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  // Skip test files
  if (filePath.includes('/test/') || filePath.includes('/tests/')) return opportunities;

  detectMissingApiDocs(filePath, content, opportunities);
  detectMissingDbMigration(filePath, content, opportunities);
  detectMissingCorsConfig(filePath, content, context, opportunities);
  detectMissingRateLimiting(filePath, content, context, opportunities);
  detectMissingGracefulShutdown(filePath, content, opportunities);

  return opportunities;
}

function detectMissingApiDocs(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  const endpoints = content.match(/@(?:Get|Post|Put|Delete|Patch)Mapping/g);
  if (!endpoints || endpoints.length < 2) return;

  // Check for Swagger/OpenAPI annotations
  const hasApiDocs =
    /@Api|@Operation|@ApiOperation|@Tag|@Schema|@ApiResponse|@Parameter|springdoc|swagger/.test(content);

  if (!hasApiDocs) {
    opportunities.push({
      type: 'missing-api-docs',
      severity: 'medium',
      file: filePath,
      current: `API 엔드포인트 ${endpoints.length}개에 Swagger/OpenAPI 문서가 없습니다`,
      suggestion: 'springdoc-openapi를 도입하고 @Operation, @Schema 등을 추가하세요. /swagger-ui.html에서 API 문서가 자동 생성되어 프론트엔드 협업과 API 테스트가 쉬워집니다',
      portfolioValue: 7,
      keywords: ['Swagger', 'OpenAPI', 'API 문서화', 'springdoc'],
    });
  }
}

function detectMissingDbMigration(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Only check main application class
  const isMainApp = /@SpringBootApplication/.test(content);
  if (!isMainApp) return;

  // Check for Flyway or Liquibase
  const hasMigration =
    /flyway|liquibase|FlywayMigrationStrategy|SpringLiquibase/.test(content);

  // Check for JPA ddl-auto (common anti-pattern in production)
  const hasHibernateAuto = /ddl-auto|hibernate\.hbm2ddl/.test(content);

  if (!hasMigration) {
    opportunities.push({
      type: 'missing-db-migration',
      severity: 'high',
      file: filePath,
      current: 'DB 마이그레이션 도구(Flyway/Liquibase)가 감지되지 않았습니다',
      suggestion: 'Flyway를 도입하여 DB 스키마를 버전 관리하세요. spring.jpa.hibernate.ddl-auto=validate와 함께 사용하면 프로덕션에서 안전한 스키마 관리가 가능합니다',
      portfolioValue: 8,
      keywords: ['Flyway', 'DB 마이그레이션', '스키마 버전 관리', 'DevOps'],
    });
  }
}

function detectMissingCorsConfig(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  // Check for @CrossOrigin or global CORS config
  const hasCors =
    /@CrossOrigin|CorsConfiguration|CorsRegistry|addCorsMappings|corsConfigurationSource/.test(content);

  // Only flag if security config exists (implying a real web app)
  if (!context.hasSecurityConfig) return;
  if (hasCors) return;

  // Check once per project (only on first controller)
  const classNameMatch = content.match(/class\s+(\w+)/);
  if (!classNameMatch) return;

  opportunities.push({
    type: 'missing-cors-config',
    severity: 'medium',
    file: filePath,
    current: 'Security 설정이 있지만 CORS 구성이 보이지 않습니다',
    suggestion: 'WebMvcConfigurer.addCorsMappings() 또는 CorsConfigurationSource Bean으로 CORS를 명시적으로 설정하세요. 프론트엔드 분리 환경에서 필수입니다',
    portfolioValue: 6,
    keywords: ['CORS', 'Spring Security', 'API Gateway', '프론트엔드 연동'],
  });
}

function detectMissingRateLimiting(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  // Only check main app or security config
  const isMainApp = /@SpringBootApplication/.test(content);
  const isSecurityConfig = /@EnableWebSecurity|SecurityFilterChain/.test(content);
  if (!isMainApp && !isSecurityConfig) return;

  const hasRateLimiting =
    /RateLimiter|Bucket4j|@RateLimit|RateLimitInterceptor|RequestRateLimiterGatewayFilterFactory|guava.*RateLimiter/.test(content);

  if (!hasRateLimiting && context.hasSecurityConfig) {
    opportunities.push({
      type: 'missing-rate-limiting',
      severity: 'medium',
      file: filePath,
      current: 'API Rate Limiting이 구성되지 않았습니다',
      suggestion: 'Bucket4j 또는 Spring Cloud Gateway RateLimiter를 도입하세요. DDoS/브루트포스 공격을 방어하고, API 남용을 방지합니다',
      portfolioValue: 7,
      keywords: ['Rate Limiting', 'API 보안', 'Bucket4j', 'DDoS 방어'],
    });
  }
}

function detectMissingGracefulShutdown(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isMainApp = /@SpringBootApplication/.test(content);
  if (!isMainApp) return;

  const hasGracefulShutdown =
    /server\.shutdown\s*=\s*graceful|@PreDestroy|DisposableBean|SmartLifecycle|setRegisterShutdownHook/.test(content);

  if (!hasGracefulShutdown) {
    opportunities.push({
      type: 'missing-graceful-shutdown',
      severity: 'low',
      file: filePath,
      current: 'Graceful Shutdown 설정이 감지되지 않았습니다',
      suggestion: 'application.yml에 server.shutdown=graceful과 spring.lifecycle.timeout-per-shutdown-phase=30s를 추가하세요. 배포 시 진행 중인 요청이 완료된 후 종료됩니다',
      portfolioValue: 6,
      keywords: ['Graceful Shutdown', '무중단 배포', 'Kubernetes', 'DevOps'],
    });
  }
}
