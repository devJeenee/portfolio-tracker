import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeSpringPatterns(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectFatController(filePath, content, conventions, opportunities);
  detectMissingDto(filePath, content, context, conventions, opportunities);

  return opportunities;
}

function detectFatController(
  filePath: string,
  content: string,
  conventions: SpringConventions,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  const maxLines = conventions.thresholds?.controllerMaxLines ?? 200;

  const repositoryUsage = /@Autowired[\s\S]*?Repository|private\s+\w+Repository/.test(content);
  const lineCount = content.split('\n').length;
  const publicMethods = content.match(/public\s+\w[\w<>,\s]*\s+\w+\s*\(/g);
  const methodCount = publicMethods ? publicMethods.length : 0;

  // Logic density: count if/for/while/switch in non-comment lines
  const logicStatements = content.match(/\b(?:if|for|while|switch)\s*\(/g);
  const logicDensity = logicStatements ? logicStatements.length : 0;

  // Composite scoring: repository direct use + logic density + method count + line count
  const highLineThreshold = Math.round(maxLines * 1.5);
  const score =
    (repositoryUsage ? 3 : 0) +
    (logicDensity > 10 ? 3 : logicDensity > 5 ? 2 : 0) +
    (methodCount > 10 ? 2 : methodCount > 7 ? 1 : 0) +
    (lineCount > highLineThreshold ? 2 : lineCount > maxLines ? 1 : 0);

  if (score >= 3) {
    const reasons: string[] = [];
    if (repositoryUsage) reasons.push('Repository 직접 사용');
    if (logicDensity > 5) reasons.push(`제어문 ${logicDensity}개`);
    if (methodCount > 7) reasons.push(`메서드 ${methodCount}개`);
    if (lineCount > 200) reasons.push(`${lineCount}줄`);

    const severity = score >= 5 ? 'high' : 'medium';

    opportunities.push({
      type: 'fat-controller',
      severity,
      file: filePath,
      current: `Controller에 비즈니스 로직이 과도합니다: ${reasons.join(', ')}`,
      suggestion: 'Service 계층으로 비즈니스 로직을 분리하세요. Controller는 요청/응답 처리만 담당해야 합니다',
      portfolioValue: 9,
      keywords: ['레이어드 아키텍처', 'SRP', 'Controller-Service 분리', 'Spring Boot'],
    });
  }
}

function detectMissingDto(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  conventions: SpringConventions,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  const responseBodyMethods = content.match(
    /@(?:GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)/g,
  );
  if (!responseBodyMethods || responseBodyMethods.length === 0) return;

  // Check if the controller returns Entity classes from the project context
  let entityReturnCount = 0;

  for (const entityClass of context.entityClasses) {
    const shortName = entityClass.split('.').pop() ?? entityClass;
    // Check for direct return of entity type (not wrapped in DTO)
    const entityReturnPattern = new RegExp(
      `(?:ResponseEntity\\s*<\\s*)?(?:List\\s*<\\s*)?${shortName}(?:\\s*>)?(?:\\s*>)?\\s+\\w+\\s*\\(`,
    );
    if (entityReturnPattern.test(content)) {
      entityReturnCount++;
    }
  }

  // Also check for direct repository returns (entity exposure)
  const repoDirectReturn = /return\s+\w+Repository\.\w+\(/.test(content);

  // Check if DTO/Response classes are actually used
  const hasDtoUsage = context.dtoClasses.length > 0 &&
    context.dtoClasses.some(dto => {
      const shortName = dto.split('.').pop() ?? dto;
      return content.includes(shortName);
    });

  const dtoSuffixes = conventions.naming?.dtoSuffix ?? ['Dto', 'DTO', 'Response', 'Request'];
  const dtoPattern = new RegExp(`(?:${dtoSuffixes.join('|')})\\b`);
  const localDtoUsage = dtoPattern.test(content);

  if ((entityReturnCount > 0 || repoDirectReturn) && !hasDtoUsage && !localDtoUsage) {
    opportunities.push({
      type: 'no-dto',
      severity: 'high',
      file: filePath,
      current: `Entity를 직접 반환하는 API가 감지되었습니다 (Entity ${entityReturnCount}종 사용)`,
      suggestion: 'Response DTO를 생성하여 Entity를 직접 노출하지 마세요. 순환 참조, 불필요한 필드 노출 등의 문제를 방지할 수 있습니다',
      portfolioValue: 8,
      keywords: ['DTO 패턴', 'API 설계', '데이터 은닉', 'Spring Boot'],
    });
  }
}
