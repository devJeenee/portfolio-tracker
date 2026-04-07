import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';
import { getLineNumber } from '../../../../utils/line-number.js';

export function analyzeTransactionPatterns(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectMissingTransactional(filePath, content, context, opportunities);
  detectReadonlyTransaction(filePath, content, context, opportunities);
  detectControllerTransaction(filePath, content, opportunities);

  return opportunities;
}

function detectMissingTransactional(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content) ||
    context.serviceClasses.some(s => filePath.includes(s));
  if (!isService) return;

  const writeOps = /\.(save|saveAll|delete|deleteAll|deleteById|update|flush)\s*\(/g;
  const methods = content.match(
    /(?:public|protected)\s+\w[\w<>,\s]*\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g,
  );
  if (!methods) return;

  let missingCount = 0;
  let firstLine: number | undefined;

  for (const method of methods) {
    const methodStart = content.indexOf(method);
    const methodEnd = findMethodEnd(content, methodStart + method.length);
    const methodBody = content.substring(methodStart, methodEnd);

    const hasWriteOp = writeOps.test(methodBody);
    writeOps.lastIndex = 0;

    if (!hasWriteOp) continue;

    const precedingLines = content.substring(
      Math.max(0, methodStart - 200),
      methodStart,
    );
    const hasTransactional = /@Transactional/.test(precedingLines);
    const classLevelTransactional = /^@Transactional\b/m.test(
      content.substring(0, content.indexOf('class ')),
    );

    if (!hasTransactional && !classLevelTransactional) {
      missingCount++;
      if (firstLine === undefined) {
        firstLine = getLineNumber(content, methodStart);
      }
    }
  }

  if (missingCount > 0) {
    opportunities.push({
      type: 'missing-transactional',
      severity: 'high',
      file: filePath,
      line: firstLine,
      current: `DB 쓰기 작업이 있는 Service 메서드 ${missingCount}개에 @Transactional이 없습니다`,
      suggestion: '데이터 정합성을 위해 @Transactional을 추가하세요. 여러 DB 작업이 하나의 트랜잭션으로 묶여야 합니다',
      portfolioValue: 8,
      keywords: ['@Transactional', '트랜잭션 관리', '데이터 정합성', 'Spring Boot'],
    });
  }
}

function detectReadonlyTransaction(
  filePath: string,
  content: string,
  _context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  const readOnlyMethods = content.match(
    /(?:public|protected)\s+(?:List|Set|Optional|Page|Slice|\w+(?:Dto|DTO|Response))\s*<[^>]*>\s+\w+\s*\([^)]*\)\s*\{/g,
  );
  if (!readOnlyMethods) return;

  let missingReadOnly = 0;

  for (const method of readOnlyMethods) {
    const methodStart = content.indexOf(method);
    const methodEnd = findMethodEnd(content, methodStart + method.length);
    const methodBody = content.substring(methodStart, methodEnd);

    const hasWriteOp = /\.(save|delete|update|flush)\s*\(/.test(methodBody);
    if (hasWriteOp) continue;

    const precedingLines = content.substring(
      Math.max(0, methodStart - 300),
      methodStart,
    );
    const hasReadOnly = /@Transactional\s*\(\s*readOnly\s*=\s*true\s*\)/.test(precedingLines);
    const hasTransactional = /@Transactional/.test(precedingLines);

    if (hasTransactional && !hasReadOnly) {
      missingReadOnly++;
    }
  }

  if (missingReadOnly > 0) {
    opportunities.push({
      type: 'readonly-transaction',
      severity: 'medium',
      file: filePath,
      current: `조회 전용 메서드 ${missingReadOnly}개에 readOnly=true가 없습니다`,
      suggestion: '@Transactional(readOnly = true)로 변경하면 JPA flush 모드가 MANUAL로 설정되어 성능이 향상됩니다',
      portfolioValue: 5,
      keywords: ['readOnly 트랜잭션', 'JPA 성능 최적화', 'Spring Boot'],
    });
  }
}

function detectControllerTransaction(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  const hasTransactional = /@Transactional/.test(content);
  if (!hasTransactional) return;

  opportunities.push({
    type: 'controller-transaction',
    severity: 'high',
    file: filePath,
    current: 'Controller에서 @Transactional을 직접 사용하고 있습니다',
    suggestion: '트랜잭션 관리는 Service 계층에서 처리하세요. Controller는 요청/응답 처리만 담당해야 합니다',
    portfolioValue: 7,
    keywords: ['레이어드 아키텍처', '트랜잭션 관리', 'SRP', 'Spring Boot'],
  });
}

function findMethodEnd(content: string, startBrace: number): number {
  let depth = 1;
  let i = startBrace;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  return i;
}
