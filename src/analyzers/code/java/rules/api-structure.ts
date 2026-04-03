import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeApiStructure(
  filePath: string,
  content: string,
  _context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectMissingValidation(filePath, content, opportunities);
  detectNPlusOne(filePath, content, opportunities);

  return opportunities;
}

function detectMissingValidation(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Extract each method signature line that contains @RequestBody
  const lines = content.split('\n');
  let totalRequestBody = 0;
  let validatedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/@RequestBody/.test(line)) continue;

    totalRequestBody++;

    // Check the full method signature: current line + preceding lines (for multi-line signatures)
    const signatureWindow = lines.slice(Math.max(0, i - 3), i + 1).join(' ');
    if (/@Valid\b|@Validated\b/.test(signatureWindow)) {
      validatedCount++;
    }
  }

  if (totalRequestBody > 0 && validatedCount < totalRequestBody) {
    const missing = totalRequestBody - validatedCount;
    opportunities.push({
      type: 'missing-validation',
      severity: 'medium',
      file: filePath,
      current: `@RequestBody ${totalRequestBody}개 중 ${missing}개에 @Valid가 없습니다`,
      suggestion: '@Valid 어노테이션과 DTO에 Bean Validation(@NotNull, @Size 등)을 추가하세요',
      portfolioValue: 6,
      keywords: ['입력 검증', 'Bean Validation', 'API 안정성', 'Spring Boot'],
    });
  }
}

function detectNPlusOne(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const loopPatterns = [
    // Standard for loops
    { pattern: /for\s*\([^)]+\)\s*\{([\s\S]*?)\}/g, type: 'for' as const },
    // stream().forEach()
    { pattern: /\.stream\(\)[\s\S]*?\.forEach\s*\(\s*(?:\w+|\([^)]*\))\s*->\s*\{([\s\S]*?)\}\s*\)/g, type: 'stream' as const },
    // .forEach(lambda) without stream
    { pattern: /\.forEach\s*\(\s*(?:\w+|\([^)]*\))\s*->\s*\{([\s\S]*?)\}\s*\)/g, type: 'forEach' as const },
  ];

  const dbCallPattern = /Repository\.\w+\(|\.find\w+\(|\.get\w+\(|\.save\w+\(|\.delete\w+\(/;

  for (const { pattern, type } of loopPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const loopBody = match[1];
      if (!loopBody || !dbCallPattern.test(loopBody)) continue;

      // Check if the DB call is inside a conditional (lower severity)
      const isConditional = /if\s*\(/.test(loopBody);
      const severity = isConditional ? 'medium' : 'high';
      const loopDesc = type === 'for' ? '반복문' : type === 'stream' ? 'stream().forEach()' : '.forEach()';

      opportunities.push({
        type: 'n-plus-one',
        severity,
        file: filePath,
        current: `${loopDesc} 내에서 Repository/DB 호출이 감지되었습니다 (N+1 문제 가능성)`,
        suggestion: 'JOIN FETCH, @EntityGraph, 또는 IN 쿼리로 한 번에 조회하세요',
        portfolioValue: severity === 'high' ? 9 : 7,
        keywords: ['N+1 문제', 'JPA 최적화', '쿼리 성능', 'FETCH JOIN'],
      });
      break;
    }
  }
}
