import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';
import { getLineNumber } from '../../../../utils/line-number.js';

export function analyzeCodeQualityPatterns(
  filePath: string,
  content: string,
  _context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectFieldInjection(filePath, content, opportunities);
  detectSysoutUsage(filePath, content, opportunities);
  detectLongMethod(filePath, content, opportunities);
  detectValueOveruse(filePath, content, opportunities);

  return opportunities;
}

function detectFieldInjection(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  if (filePath.includes('/test/') || filePath.includes('/tests/') || filePath.includes('Test.')) return;

  const pattern = /@Autowired\s+(?:private|protected|public)\s+\w+/g;
  const lines: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    lines.push(getLineNumber(content, match.index));
  }

  if (lines.length > 0) {
    opportunities.push({
      type: 'field-injection',
      severity: 'high',
      file: filePath,
      line: lines[0],
      current: `@Autowired 필드 주입이 ${lines.length}개 감지되었습니다 (line ${lines.join(', ')})`,
      suggestion: '생성자 주입(Constructor Injection)으로 변경하세요. 테스트 용이성과 불변성이 향상됩니다',
      portfolioValue: 8,
      keywords: ['생성자 주입', 'DI', 'Spring Boot', 'SOLID'],
    });
  }
}

function detectSysoutUsage(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  if (filePath.includes('/test/') || filePath.includes('/tests/') || filePath.includes('Test.')) return;

  const pattern = /System\.(out|err)\.(println|print)\s*\(/g;
  const lines: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    lines.push(getLineNumber(content, match.index));
  }

  if (lines.length > 0) {
    opportunities.push({
      type: 'sysout-usage',
      severity: 'medium',
      file: filePath,
      line: lines[0],
      current: `System.out/err 사용이 ${lines.length}개 감지되었습니다 (line ${lines.join(', ')})`,
      suggestion: 'SLF4J Logger를 사용하세요. 로그 레벨 제어, 파일 출력, 구조화된 로깅이 가능합니다',
      portfolioValue: 7,
      keywords: ['SLF4J', 'Logback', '로깅', 'Spring Boot'],
    });
  }
}

function detectLongMethod(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const methodPattern = /(?:public|protected|private)\s+(?:static\s+)?(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  const longMethods: Array<{ name: string; lines: number; line: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = methodPattern.exec(content)) !== null) {
    const methodName = match[1];
    const startIndex = match.index + match[0].length;
    const endIndex = findMethodEnd(content, startIndex);
    const methodBody = content.substring(match.index, endIndex);
    const lineCount = methodBody.split('\n').length;

    if (lineCount > 50) {
      longMethods.push({
        name: methodName,
        lines: lineCount,
        line: getLineNumber(content, match.index),
      });
    }
  }

  if (longMethods.length > 0) {
    const details = longMethods.map(m => `${m.name}(${m.lines}줄, line ${m.line})`).join(', ');
    opportunities.push({
      type: 'long-method',
      severity: 'medium',
      file: filePath,
      line: longMethods[0].line,
      current: `50줄 초과 메서드 ${longMethods.length}개: ${details}`,
      suggestion: '메서드를 작은 단위로 분리하세요. Extract Method 리팩토링으로 가독성과 재사용성을 높일 수 있습니다',
      portfolioValue: 5,
      keywords: ['리팩토링', 'Clean Code', 'SRP', 'Extract Method'],
    });
  }
}

function detectValueOveruse(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const valuePattern = /@Value\s*\(\s*"/g;
  let count = 0;
  while (valuePattern.exec(content) !== null) {
    count++;
  }

  if (count >= 5) {
    opportunities.push({
      type: 'value-overuse',
      severity: 'low',
      file: filePath,
      current: `@Value 어노테이션이 ${count}개 사용되었습니다`,
      suggestion: '@ConfigurationProperties를 사용하면 타입 안전성, 검증(@Validated), IDE 자동완성을 얻을 수 있습니다',
      portfolioValue: 5,
      keywords: ['@ConfigurationProperties', '@Value', 'Spring Boot', '타입 안전성'],
    });
  }
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
