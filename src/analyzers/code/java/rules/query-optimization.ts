import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeQueryOptimization(
  filePath: string,
  content: string,
  _context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectSelectStar(filePath, content, opportunities);
  detectLikeLeadingWildcard(filePath, content, opportunities);
  detectFindAllWithoutPagination(filePath, content, opportunities);
  detectMissingIndexHint(filePath, content, opportunities);

  return opportunities;
}

function detectSelectStar(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Check @Query annotations with SELECT *
  const queryAnnotations = content.match(/@Query\s*\(\s*(?:value\s*=\s*)?"([^"]+)"/g);
  if (!queryAnnotations) return;

  let selectStarCount = 0;
  for (const q of queryAnnotations) {
    const sqlMatch = q.match(/"([^"]+)"/);
    if (!sqlMatch) continue;
    const sql = sqlMatch[1].toUpperCase();

    // SELECT * or native query without column specification
    if (/SELECT\s+\*\s+FROM/.test(sql)) {
      selectStarCount++;
    }
  }

  if (selectStarCount > 0) {
    opportunities.push({
      type: 'select-star',
      severity: 'medium',
      file: filePath,
      current: `SELECT * 쿼리가 ${selectStarCount}개 감지되었습니다`,
      suggestion: '필요한 컬럼만 지정하거나 Projection(DTO)을 사용하세요. SELECT *는 불필요한 데이터 전송과 인덱스 활용을 방해합니다',
      portfolioValue: 6,
      keywords: ['쿼리 최적화', 'Projection', 'SELECT 최적화', 'JPA'],
    });
  }
}

function detectLikeLeadingWildcard(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // LIKE '%...' or LIKE concat('%', ...)
  const likePatterns = [
    /LIKE\s+'%/gi,
    /LIKE\s+CONCAT\s*\(\s*'%'/gi,
    /LIKE\s+:?\w*\s*--.*leading/gi,
  ];

  let matchCount = 0;
  for (const pattern of likePatterns) {
    const matches = content.match(pattern);
    if (matches) matchCount += matches.length;
  }

  // Also check for dynamic string building: "%" + param
  const dynamicLike = content.match(/"\s*%\s*"\s*\+\s*\w+|"%" \+ \w+/g);
  if (dynamicLike) matchCount += dynamicLike.length;

  if (matchCount > 0) {
    opportunities.push({
      type: 'like-leading-wildcard',
      severity: 'medium',
      file: filePath,
      current: `LIKE '%...' 패턴이 ${matchCount}개 감지되었습니다 (인덱스 무효화)`,
      suggestion: 'LIKE 앞에 %를 붙이면 인덱스를 사용할 수 없습니다. Full-Text Search(MySQL FULLTEXT, Elasticsearch)를 고려하세요',
      portfolioValue: 7,
      keywords: ['쿼리 최적화', 'LIKE 성능', 'Full-Text Search', '인덱스'],
    });
  }
}

function detectFindAllWithoutPagination(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Repository interface extending JpaRepository
  const isRepository = /interface\s+\w+\s+extends\s+\w*Repository/.test(content);
  if (isRepository) return; // Repositories define methods, not call them

  // Service or other classes calling .findAll() without Pageable
  const isService = /@Service/.test(content);
  if (!isService) return;

  const findAllCalls = content.match(/\w+Repository\.findAll\s*\(\s*\)/g);
  if (!findAllCalls || findAllCalls.length === 0) return;

  // Check if any Pageable overload is also used
  const hasPageable = /\.findAll\s*\(\s*\w*[Pp]ageable/.test(content);
  if (hasPageable) return;

  opportunities.push({
    type: 'findall-without-pagination',
    severity: 'high',
    file: filePath,
    current: `findAll()을 페이지네이션 없이 호출하는 곳이 ${findAllCalls.length}개 있습니다`,
    suggestion: 'findAll(Pageable)을 사용하세요. 데이터가 늘어나면 OOM이 발생할 수 있습니다. Slice<T>도 고려해보세요',
    portfolioValue: 8,
    keywords: ['페이지네이션', 'OOM 방지', 'findAll 최적화', 'Spring Data'],
  });
}

function detectMissingIndexHint(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Repository interface with custom query methods
  const isRepository = /interface\s+\w+\s+extends\s+\w*Repository/.test(content);
  if (!isRepository) return;

  // Find custom findBy methods with multiple conditions
  const complexFinders = content.match(
    /(?:findBy|findAllBy|countBy|existsBy)\w+And\w+(?:And\w+)+\s*\(/g,
  );

  // Find @Query with multiple WHERE conditions
  const complexQueries = content.match(
    /@Query\s*\([^)]*WHERE[^)]*AND[^)]*AND[^)]*\)/gi,
  );

  const totalComplex = (complexFinders?.length ?? 0) + (complexQueries?.length ?? 0);

  if (totalComplex >= 2) {
    opportunities.push({
      type: 'missing-index-hint',
      severity: 'medium',
      file: filePath,
      current: `다중 조건 쿼리가 ${totalComplex}개 있습니다 — 복합 인덱스가 필요할 수 있습니다`,
      suggestion: '자주 사용되는 복합 조건에 @Table(indexes = @Index(...))로 복합 인덱스를 추가하세요. EXPLAIN으로 쿼리 플랜을 확인하는 것을 권장합니다',
      portfolioValue: 7,
      keywords: ['복합 인덱스', '쿼리 성능', 'DB 최적화', 'JPA Index'],
    });
  }
}
