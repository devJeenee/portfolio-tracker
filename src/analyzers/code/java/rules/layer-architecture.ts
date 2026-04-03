import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeLayerArchitecture(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectMissingServiceLayer(filePath, content, context, opportunities);
  detectGodService(filePath, content, conventions, opportunities);
  detectCircularDependency(filePath, content, context, opportunities);

  return opportunities;
}

function detectMissingServiceLayer(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  if (context.serviceClasses.length === 0) return;

  const repoInjection = content.match(
    /(?:@Autowired|private\s+final)\s+\w*Repository\s+\w+/g,
  );
  if (!repoInjection || repoInjection.length === 0) return;

  const serviceInjection = /(?:@Autowired|private\s+final)\s+\w*Service\s+\w+/.test(content);

  if (!serviceInjection) {
    opportunities.push({
      type: 'missing-service-layer',
      severity: 'high',
      file: filePath,
      current: `Controller가 Repository를 직접 주입받아 사용합니다 (Service 계층 스킵)`,
      suggestion: 'Service 클래스를 통해 Repository에 접근하세요. Controller → Service → Repository 흐름을 유지해야 합니다',
      portfolioValue: 8,
      keywords: ['레이어드 아키텍처', 'Service 계층', 'SRP', 'Spring Boot'],
    });
  }
}

function detectGodService(
  filePath: string,
  content: string,
  conventions: SpringConventions,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  const maxLines = conventions.thresholds?.serviceMaxLines ?? 500;
  const maxDeps = conventions.thresholds?.serviceMaxDependencies ?? 8;
  const maxMethods = conventions.thresholds?.serviceMaxMethods ?? 15;

  const lineCount = content.split('\n').length;
  const injections = content.match(
    /(?:@Autowired|private\s+final)\s+\w+\s+\w+/g,
  );
  const injectionCount = injections ? injections.length : 0;
  const publicMethods = content.match(
    /public\s+\w[\w<>,\s]*\s+\w+\s*\(/g,
  );
  const methodCount = publicMethods ? publicMethods.length : 0;

  const isGod = lineCount > maxLines || injectionCount >= maxDeps || methodCount >= maxMethods;
  if (!isGod) return;

  const reasons: string[] = [];
  if (lineCount > 500) reasons.push(`${lineCount}줄`);
  if (injectionCount >= 8) reasons.push(`의존성 ${injectionCount}개`);
  if (methodCount >= 15) reasons.push(`public 메서드 ${methodCount}개`);

  opportunities.push({
    type: 'god-service',
    severity: 'high',
    file: filePath,
    current: `God Service 감지: ${reasons.join(', ')}`,
    suggestion: '도메인별로 Service를 분리하세요. 하나의 Service는 하나의 도메인 책임만 가져야 합니다',
    portfolioValue: 7,
    keywords: ['God Object', 'SRP', '도메인 분리', '리팩토링'],
  });
}

function detectCircularDependency(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  const classNameMatch = content.match(/class\s+(\w+)/);
  if (!classNameMatch) return;
  const className = classNameMatch[1];

  const packageMatch = content.match(/^package\s+([\w.]+);/m);
  if (!packageMatch) return;
  const packageName = packageMatch[1];

  const importedServices = content.match(
    /import\s+[\w.]+\.(\w+Service)\s*;/g,
  );
  if (!importedServices) return;

  for (const imp of importedServices) {
    const importedName = imp.match(/\.(\w+Service)\s*;/)?.[1];
    if (!importedName) continue;

    if (!context.serviceClasses.includes(importedName)) continue;

    const isSamePackage = imp.includes(packageName);
    if (isSamePackage) {
      opportunities.push({
        type: 'circular-dependency',
        severity: 'medium',
        file: filePath,
        current: `${className}과 ${importedName} 간 같은 패키지 내 양방향 의존 가능성`,
        suggestion: '이벤트 기반 통신(@EventListener), 공통 Service 추출, 또는 의존성 방향을 재설계하세요',
        portfolioValue: 6,
        keywords: ['순환 의존', '의존성 관리', 'Event-Driven', 'Spring Boot'],
      });
      break;
    }
  }
}
