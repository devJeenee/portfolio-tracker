import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';
import { getLineNumber } from '../../../../utils/line-number.js';

export function analyzeSecurityPatterns(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectHardcodedSecrets(filePath, content, opportunities);
  detectSqlInjection(filePath, content, opportunities);
  detectSensitiveLogging(filePath, content, opportunities);
  detectMissingAuth(filePath, content, context, opportunities);

  return opportunities;
}

function detectHardcodedSecrets(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  if (filePath.includes('/test/') || filePath.includes('/tests/') || filePath.includes('Test.')) return;

  const secretPatterns = [
    /(?:password|passwd|pwd)\s*=\s*"[^"]{3,}"/gi,
    /(?:secret|apiKey|api_key|apiSecret|api_secret)\s*=\s*"[^"]{3,}"/gi,
    /(?:token|accessToken|access_token)\s*=\s*"[^"]{8,}"/gi,
    /(?:private_key|privateKey)\s*=\s*"[^"]{8,}"/gi,
  ];

  let totalMatches = 0;
  let firstLine: number | undefined;
  for (const pattern of secretPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      totalMatches++;
      if (firstLine === undefined) {
        firstLine = getLineNumber(content, match.index);
      }
    }
  }

  if (totalMatches > 0) {
    opportunities.push({
      type: 'hardcoded-secret',
      severity: 'high',
      file: filePath,
      line: firstLine,
      current: `하드코딩된 시크릿이 ${totalMatches}개 감지되었습니다`,
      suggestion: 'application.yml의 환경 변수(${ENV_VAR}) 또는 Vault/AWS Secrets Manager를 사용하세요',
      portfolioValue: 9,
      keywords: ['시크릿 관리', '보안', '환경 변수', '12-Factor App'],
    });
  }
}

function detectSqlInjection(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const sqlConcatPatterns = [
    /"(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\s[^"]*"\s*\+\s*\w+/gi,
    /"\s*\+\s*\w+\s*\+\s*"(?:\s*(?:AND|OR|WHERE|SET|VALUES))/gi,
    /String\.format\s*\(\s*"(?:SELECT|INSERT|UPDATE|DELETE)[^"]*%s/gi,
  ];

  let totalMatches = 0;
  let firstLine: number | undefined;
  for (const pattern of sqlConcatPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      totalMatches++;
      if (firstLine === undefined) {
        firstLine = getLineNumber(content, match.index);
      }
    }
  }

  if (totalMatches > 0) {
    opportunities.push({
      type: 'sql-injection',
      severity: 'high',
      file: filePath,
      line: firstLine,
      current: `SQL 문자열 결합이 ${totalMatches}개 감지되었습니다 (SQL Injection 위험)`,
      suggestion: 'JPA Named Parameter(:param), @Query의 ?1, 또는 PreparedStatement를 사용하세요',
      portfolioValue: 9,
      keywords: ['SQL Injection', '보안', 'Prepared Statement', 'OWASP Top 10'],
    });
  }
}

function detectSensitiveLogging(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const logPatterns = /(?:log|logger|LOG)\s*\.\s*(?:info|debug|warn|error|trace)\s*\([^)]*(?:password|token|secret|credential|apiKey|privateKey|ssn|creditCard)[^)]*\)/gi;
  const matches = content.match(logPatterns);

  if (matches && matches.length > 0) {
    opportunities.push({
      type: 'sensitive-logging',
      severity: 'medium',
      file: filePath,
      current: `민감 정보가 포함된 로그가 ${matches.length}개 있습니다`,
      suggestion: '민감 정보는 마스킹 처리하거나 로그에서 제외하세요. GDPR/개인정보보호법 위반 가능성이 있습니다',
      portfolioValue: 6,
      keywords: ['민감 정보 보호', '로깅 보안', 'GDPR', '개인정보'],
    });
  }
}

function detectMissingAuth(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  if (!context.hasSecurityConfig) return;

  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  const hasClassAuth = /@PreAuthorize|@Secured|@RolesAllowed/.test(
    content.substring(0, content.indexOf('class ')),
  );
  if (hasClassAuth) return;

  const sensitivePatterns = /(?:@(?:Post|Put|Delete|Patch)Mapping)/g;
  const mutations = content.match(sensitivePatterns);
  if (!mutations || mutations.length === 0) return;

  const hasMethodAuth = /@PreAuthorize|@Secured|@RolesAllowed/.test(content);
  if (hasMethodAuth) return;

  opportunities.push({
    type: 'missing-auth',
    severity: 'high',
    file: filePath,
    current: `Security 설정이 있지만 변경 API ${mutations.length}개에 인가 어노테이션이 없습니다`,
    suggestion: '@PreAuthorize("hasRole(\'ADMIN\')") 등으로 메서드 수준 인가를 추가하세요',
    portfolioValue: 7,
    keywords: ['Spring Security', '인가', 'RBAC', 'Method Security'],
  });
}
