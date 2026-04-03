import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeExceptionHandling(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectRawException(filePath, content, context, opportunities);
  detectEmptyCatch(filePath, content, opportunities);

  return opportunities;
}

function detectRawException(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const rawThrows = content.match(
    /throw\s+new\s+(RuntimeException|Exception|IllegalArgumentException|IllegalStateException|NullPointerException)\s*\(/g,
  );

  if (!rawThrows || rawThrows.length === 0) return;

  // Cross-file: check if another file has @ControllerAdvice
  const hasLocalHandler = /@ControllerAdvice|@ExceptionHandler/.test(content);
  const hasGlobalHandler = context.hasControllerAdvice;

  // If a global handler exists, check if it actually handles these exception types
  if (hasLocalHandler) return;

  if (hasGlobalHandler) {
    // Check if the thrown exceptions are covered by the global handler
    const thrownTypes = rawThrows.map(t => {
      const m = t.match(/throw\s+new\s+(\w+)/);
      return m ? m[1] : '';
    }).filter(Boolean);

    const uncovered = thrownTypes.filter(
      t => !context.globalExceptionTypes.includes(t),
    );

    if (uncovered.length === 0) return;

    // Some exceptions are not covered by global handler
    opportunities.push({
      type: 'raw-exception',
      severity: 'low',
      file: filePath,
      current: `범용 Exception을 throw하는 코드 ${rawThrows.length}개 중 글로벌 핸들러가 처리하지 않는 타입이 있습니다`,
      suggestion: '커스텀 예외 클래스를 생성하고 @ControllerAdvice의 @ExceptionHandler에 등록하세요',
      portfolioValue: 5,
      keywords: ['글로벌 예외 처리', '@ControllerAdvice', '커스텀 예외', 'Spring Boot'],
    });
    return;
  }

  // No global handler at all
  opportunities.push({
    type: 'raw-exception',
    severity: 'medium',
    file: filePath,
    current: `범용 Exception을 직접 throw하는 코드가 ${rawThrows.length}개 있고, @ControllerAdvice가 프로젝트에 없습니다`,
    suggestion: '커스텀 예외 클래스를 생성하고, @ControllerAdvice로 글로벌 예외 처리를 구현하세요',
    portfolioValue: 7,
    keywords: ['글로벌 예외 처리', '@ControllerAdvice', '커스텀 예외', 'Spring Boot'],
  });
}

function detectEmptyCatch(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Match empty catch blocks AND catch blocks with only comments
  const emptyCatchPattern = /catch\s*\([^)]+\)\s*\{\s*(?:\/\/[^\n]*\s*)*\}/g;
  const matches = content.match(emptyCatchPattern);

  if (matches && matches.length > 0) {
    opportunities.push({
      type: 'error-handling',
      severity: 'medium',
      file: filePath,
      current: `빈 catch 블록이 ${matches.length}개 있습니다 (주석만 있는 경우 포함)`,
      suggestion: '최소한 로깅을 추가하고, 적절한 예외 전파 또는 복구 로직을 구현하세요',
      portfolioValue: 5,
      keywords: ['예외 처리', '로깅', '안정성'],
    });
  }
}
