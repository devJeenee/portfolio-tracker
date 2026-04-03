import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeTestCoverage(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectMissingServiceTest(filePath, content, context, opportunities);
  detectMissingControllerTest(filePath, content, context, opportunities);
  detectMissingIntegrationTest(filePath, content, context, opportunities);

  return opportunities;
}

function detectMissingServiceTest(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  if (filePath.includes('/test/') || filePath.includes('/tests/')) return;

  const classNameMatch = content.match(/class\s+(\w+)/);
  if (!classNameMatch) return;
  const className = classNameMatch[1];

  const hasTest = context.testFileMap.has(className);
  if (hasTest) return;

  const publicMethods = content.match(/public\s+\w[\w<>,\s]*\s+\w+\s*\(/g);
  const methodCount = publicMethods ? publicMethods.length : 0;

  opportunities.push({
    type: 'missing-service-test',
    severity: 'high',
    file: filePath,
    current: `${className}에 대응하는 테스트 클래스가 없습니다 (public 메서드 ${methodCount}개)`,
    suggestion: 'JUnit 5 + Mockito로 Service 단위 테스트를 작성하세요. 핵심 비즈니스 로직부터 시작하면 좋습니다',
    portfolioValue: 9,
    keywords: ['JUnit 5', 'Mockito', '단위 테스트', 'TDD'],
  });
}

function detectMissingControllerTest(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  if (filePath.includes('/test/') || filePath.includes('/tests/')) return;

  const classNameMatch = content.match(/class\s+(\w+)/);
  if (!classNameMatch) return;
  const className = classNameMatch[1];

  const hasTest = context.testFileMap.has(className);
  if (hasTest) return;

  const endpoints = content.match(/@(?:Get|Post|Put|Delete|Patch)Mapping/g);
  const endpointCount = endpoints ? endpoints.length : 0;

  opportunities.push({
    type: 'missing-controller-test',
    severity: 'high',
    file: filePath,
    current: `${className}에 대응하는 테스트가 없습니다 (API 엔드포인트 ${endpointCount}개)`,
    suggestion: '@WebMvcTest와 MockMvc로 Controller 슬라이스 테스트를 작성하세요',
    portfolioValue: 7,
    keywords: ['@WebMvcTest', 'MockMvc', 'Controller 테스트', 'Spring Boot Test'],
  });
}

function detectMissingIntegrationTest(
  _filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isMainApp = /@SpringBootApplication/.test(content);
  if (!isMainApp) return;

  const testFiles = [...context.testFileMap.values()];
  const hasIntegrationTest = testFiles.some(tf =>
    tf.includes('IntegrationTest') || tf.includes('IT'),
  );

  const hasSpringBootTest = testFiles.length > 0;
  if (hasIntegrationTest || !hasSpringBootTest) return;

  // Only report if there are tests but no integration tests
  if (testFiles.length === 0) return;

  opportunities.push({
    type: 'missing-integration-test',
    severity: 'high',
    file: _filePath,
    current: '@SpringBootTest 기반 통합 테스트가 없습니다',
    suggestion: '주요 API 흐름(Controller → Service → Repository)을 검증하는 통합 테스트를 추가하세요',
    portfolioValue: 8,
    keywords: ['@SpringBootTest', '통합 테스트', 'TestRestTemplate', 'Spring Boot Test'],
  });
}
