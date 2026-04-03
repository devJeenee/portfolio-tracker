import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeApiDesign(
  filePath: string,
  content: string,
  _context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectMissingPagination(filePath, content, opportunities);
  detectInconsistentResponse(filePath, content, opportunities);
  detectMissingStatusCode(filePath, content, opportunities);

  return opportunities;
}

function detectMissingPagination(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  const listReturnPattern = /(?:@GetMapping[^}]*?)(?:public\s+)(?:ResponseEntity\s*<\s*)?List\s*<[^>]+>\s+\w+\s*\([^)]*\)/g;
  const matches = content.match(listReturnPattern);

  if (!matches || matches.length === 0) {
    const simpleListReturn = /public\s+List\s*<[^>]+>\s+\w+\s*\(/g;
    const getMappings = /@GetMapping/g;
    const getCount = content.match(getMappings)?.length ?? 0;
    const listCount = content.match(simpleListReturn)?.length ?? 0;

    if (getCount > 0 && listCount > 0) {
      const hasPageable = /Pageable|PageRequest|Page\s*</.test(content);
      if (!hasPageable && listCount > 0) {
        opportunities.push({
          type: 'missing-pagination',
          severity: 'medium',
          file: filePath,
          current: `List를 직접 반환하는 API가 ${listCount}개 있습니다 (페이지네이션 없음)`,
          suggestion: 'Spring Data의 Pageable과 Page<T>를 사용하여 페이지네이션을 구현하세요. 대량 데이터 조회 시 OOM 방지에 필수입니다',
          portfolioValue: 7,
          keywords: ['페이지네이션', 'Pageable', 'API 설계', 'Spring Data'],
        });
      }
    }
    return;
  }

  const hasPageable = /Pageable|PageRequest|Page\s*</.test(content);
  if (!hasPageable) {
    opportunities.push({
      type: 'missing-pagination',
      severity: 'medium',
      file: filePath,
      current: `List를 직접 반환하는 GET API가 ${matches.length}개 있습니다`,
      suggestion: 'Spring Data의 Pageable과 Page<T>를 사용하여 페이지네이션을 구현하세요',
      portfolioValue: 7,
      keywords: ['페이지네이션', 'Pageable', 'API 설계', 'Spring Data'],
    });
  }
}

function detectInconsistentResponse(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  const responseEntityCount = (content.match(/ResponseEntity\s*[<.]/g) ?? []).length;
  const mappingMethods = content.match(
    /@(?:Get|Post|Put|Delete|Patch)Mapping[\s\S]*?public\s+\w/g,
  );
  if (!mappingMethods) return;

  const totalEndpoints = mappingMethods.length;
  const directReturnCount = totalEndpoints - responseEntityCount;

  if (responseEntityCount > 0 && directReturnCount > 0 && totalEndpoints >= 3) {
    opportunities.push({
      type: 'inconsistent-response',
      severity: 'low',
      file: filePath,
      current: `ResponseEntity 사용(${responseEntityCount}개)과 직접 반환(${directReturnCount}개)이 혼용되고 있습니다`,
      suggestion: '일관된 응답 형식을 사용하세요. 공통 ApiResponse<T> 래퍼를 만들거나 ResponseEntity를 통일하세요',
      portfolioValue: 5,
      keywords: ['API 일관성', '응답 형식', 'ResponseEntity', 'REST API'],
    });
  }
}

function detectMissingStatusCode(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isController = /@(Rest)?Controller/.test(content);
  if (!isController) return;

  const postMappings = content.match(/@PostMapping/g);
  const deleteMappings = content.match(/@DeleteMapping/g);
  if (!postMappings && !deleteMappings) return;

  const hasResponseStatus = /@ResponseStatus/.test(content);
  const hasHttpStatus = /HttpStatus\.\w+|\.status\(|\.created\(|\.noContent\(|\.accepted\(/.test(content);

  if (!hasResponseStatus && !hasHttpStatus) {
    const mutationCount = (postMappings?.length ?? 0) + (deleteMappings?.length ?? 0);
    opportunities.push({
      type: 'missing-status-code',
      severity: 'low',
      file: filePath,
      current: `변경 API ${mutationCount}개가 기본 200 OK만 반환합니다`,
      suggestion: 'POST는 201 Created, DELETE는 204 No Content 등 적절한 HTTP 상태 코드를 사용하세요',
      portfolioValue: 6,
      keywords: ['HTTP 상태 코드', 'REST 규약', 'API 설계'],
    });
  }
}
