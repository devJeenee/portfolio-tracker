import type { Commit } from '../../types/index.js';

/** A portfolio-worthy improvement the developer already made */
export interface ExperienceMined {
  category: string;
  title: string;
  description: string;
  commits: string[];
  files: string[];
  portfolioNarrative: string;
  impact: 'high' | 'medium' | 'low';
}

interface MiningPattern {
  category: string;
  title: string;
  commitPatterns: RegExp[];
  filePatterns: RegExp[];
  narrative: string;
  impact: 'high' | 'medium' | 'low';
}

const MINING_PATTERNS: MiningPattern[] = [
  // Architecture improvements
  {
    category: '아키텍처',
    title: 'Service 계층 도입 / 레이어드 아키텍처 적용',
    commitPatterns: [/service\s*(?:layer|계층)|extract.*service|move.*to.*service|레이어/i],
    filePatterns: [/Service\.(java|kt)$/],
    narrative: 'Controller에서 비즈니스 로직을 Service 계층으로 분리하여 레이어드 아키텍처를 적용하고, 관심사 분리(SoC)를 달성했습니다.',
    impact: 'high',
  },
  {
    category: '아키텍처',
    title: 'DTO 패턴 도입',
    commitPatterns: [/dto|response.*class|request.*class|add.*dto/i],
    filePatterns: [/(?:Dto|DTO|Response|Request)\.(java|kt)$/],
    narrative: 'DTO 패턴을 도입하여 Entity 직접 노출을 방지하고, API 계약을 명확히 정의했습니다.',
    impact: 'medium',
  },
  // Exception handling
  {
    category: '예외 처리',
    title: '글로벌 예외 처리 구현',
    commitPatterns: [/exception.*handler|controlleradvice|global.*exception|에러.*처리|예외.*처리/i],
    filePatterns: [/(?:Exception|Error)(?:Handler|Advice)\.(java|kt)$/],
    narrative: '@ControllerAdvice 기반 글로벌 예외 처리를 구현하여 일관된 에러 응답 형식을 제공하고, 클라이언트 에러 처리를 단순화했습니다.',
    impact: 'high',
  },
  {
    category: '예외 처리',
    title: '커스텀 예외 클래스 도입',
    commitPatterns: [/custom.*exception|도메인.*예외|비즈니스.*예외/i],
    filePatterns: [/(?:Custom|Business|Domain)\w*Exception\.(java|kt)$/],
    narrative: '도메인별 커스텀 예외를 정의하여 비즈니스 규칙 위반을 명확히 표현하고, 예외 처리의 가독성을 높였습니다.',
    impact: 'medium',
  },
  // Testing
  {
    category: '테스트',
    title: '단위 테스트 추가',
    commitPatterns: [/test|테스트|junit|mockito|tdd/i],
    filePatterns: [/Test\.(java|kt)$/],
    narrative: 'JUnit 5 + Mockito 기반 단위 테스트를 작성하여 비즈니스 로직의 정확성을 검증하고, 리그레션을 방지합니다.',
    impact: 'high',
  },
  {
    category: '테스트',
    title: '통합 테스트 추가',
    commitPatterns: [/integration.*test|통합.*테스트|springboottest/i],
    filePatterns: [/(?:Integration|IT)\.(java|kt)$/],
    narrative: '@SpringBootTest 기반 통합 테스트를 구현하여 전체 요청 흐름의 정합성을 보장합니다.',
    impact: 'high',
  },
  // Security
  {
    category: '보안',
    title: 'Spring Security 도입',
    commitPatterns: [/security|인증|인가|auth|jwt|oauth/i],
    filePatterns: [/Security(?:Config|Filter)\.(java|kt)$/],
    narrative: 'Spring Security를 도입하여 인증/인가 체계를 구축하고, 메서드 수준 보안(@PreAuthorize)을 적용했습니다.',
    impact: 'high',
  },
  // Performance
  {
    category: '성능 최적화',
    title: '쿼리 성능 개선',
    commitPatterns: [/n\+1|fetch.*join|쿼리.*최적화|query.*optim|entitygraph|batch.*size/i],
    filePatterns: [/Repository\.(java|kt)$/],
    narrative: 'N+1 문제를 FETCH JOIN으로 해결하고, 쿼리 성능을 최적화하여 응답 시간을 개선했습니다.',
    impact: 'high',
  },
  {
    category: '성능 최적화',
    title: '캐싱 도입',
    commitPatterns: [/cache|캐시|caffeine|redis|cacheable/i],
    filePatterns: [/Cache(?:Config|Manager)\.(java|kt)$/],
    narrative: 'Spring Cache를 도입하여 반복 조회를 캐싱하고, DB 부하를 줄여 응답 시간을 대폭 개선했습니다.',
    impact: 'high',
  },
  // API Design
  {
    category: 'API 설계',
    title: '페이지네이션 구현',
    commitPatterns: [/pagina|페이지|pageable|paging/i],
    filePatterns: [/\.(java|kt)$/],
    narrative: 'Spring Data Pageable을 적용하여 대량 데이터 조회 시 OOM을 방지하고, 클라이언트 친화적인 API를 설계했습니다.',
    impact: 'medium',
  },
  {
    category: 'API 설계',
    title: 'API 문서화 (Swagger/OpenAPI)',
    commitPatterns: [/swagger|openapi|springdoc|api.*doc/i],
    filePatterns: [/Swagger|OpenApi|SpringDoc/i],
    narrative: 'springdoc-openapi를 도입하여 API 문서를 자동 생성하고, 프론트엔드 팀과의 협업 효율을 높였습니다.',
    impact: 'medium',
  },
  // DevOps
  {
    category: 'DevOps',
    title: 'DB 마이그레이션 도입',
    commitPatterns: [/flyway|liquibase|migration|마이그레이션/i],
    filePatterns: [/V\d+__\w+\.sql$|db\/migration/],
    narrative: 'Flyway를 도입하여 DB 스키마를 버전 관리하고, 팀 전체가 일관된 DB 환경에서 개발할 수 있게 했습니다.',
    impact: 'medium',
  },
  {
    category: 'DevOps',
    title: 'Docker/컨테이너화',
    commitPatterns: [/docker|container|컨테이너|dockerfile|docker-compose/i],
    filePatterns: [/Dockerfile|docker-compose/],
    narrative: 'Docker 컨테이너화를 통해 개발/운영 환경 일관성을 확보하고, 배포 프로세스를 자동화했습니다.',
    impact: 'medium',
  },
  // Resilience
  {
    category: '장애 대응',
    title: 'Circuit Breaker / Resilience 도입',
    commitPatterns: [/circuit.*break|resilience|retry|fallback|서킷/i],
    filePatterns: [/Resilience|CircuitBreaker|Retry/i],
    narrative: 'Resilience4j를 도입하여 외부 서비스 장애 시 fail-fast 전략으로 장애 전파를 차단했습니다.',
    impact: 'high',
  },
  // Refactoring
  {
    category: '리팩토링',
    title: '코드 구조 개선 / 리팩토링',
    commitPatterns: [/refactor|리팩토링|restructur|clean.*up|extract.*class|분리/i],
    filePatterns: [/(?:Refactor|Restructur|Clean|Simplif)\w*\.(java|kt)$/i],
    narrative: '기존 코드의 구조를 개선하여 가독성과 유지보수성을 높이고, SOLID 원칙을 준수하도록 리팩토링했습니다.',
    impact: 'medium',
  },
];

export function mineExperiences(commits: Commit[]): ExperienceMined[] {
  const experiences: ExperienceMined[] = [];
  const seen = new Set<string>();

  for (const pattern of MINING_PATTERNS) {
    const matchingCommits: Commit[] = [];

    for (const commit of commits) {
      const messageMatch = pattern.commitPatterns.some(p => p.test(commit.message));

      if (messageMatch) {
        matchingCommits.push(commit);
      }
    }

    if (matchingCommits.length === 0) continue;

    // Deduplicate by category+title
    const key = `${pattern.category}:${pattern.title}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const allFiles = [...new Set(matchingCommits.flatMap(c => c.files))];
    const relevantFiles = allFiles.filter(f => pattern.filePatterns.some(p => p.test(f)));

    experiences.push({
      category: pattern.category,
      title: pattern.title,
      description: `${matchingCommits.length}개의 커밋에서 감지됨 (${relevantFiles.length}개 파일)`,
      commits: matchingCommits.map(c => c.hash),
      files: relevantFiles.length > 0 ? relevantFiles : allFiles.slice(0, 5),
      portfolioNarrative: pattern.narrative,
      impact: matchingCommits.length >= 5 ? 'high' : pattern.impact,
    });
  }

  // Sort by impact
  const impactOrder = { high: 0, medium: 1, low: 2 };
  return experiences.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
}
