import type { CodeOpportunity, OpportunityType } from '../../types/analysis.js';

export interface CategoryScore {
  name: string;
  nameKo: string;
  score: number;        // 0-100
  maxScore: number;     // always 100
  issueCount: number;
  topIssue?: string;
}

export interface MaturityScore {
  overall: number;              // 0-100
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  categories: CategoryScore[];
  roadmap: RoadmapItem[];
}

export interface RoadmapItem {
  priority: number;
  category: string;
  type: OpportunityType;
  action: string;
  portfolioImpact: 'critical' | 'high' | 'medium';
  estimatedFiles: number;
}

const CATEGORY_MAP: Record<string, { nameKo: string; types: Set<string>; weight: number }> = {
  architecture: {
    nameKo: '아키텍처',
    weight: 20,
    types: new Set([
      'fat-controller', 'missing-service-layer', 'god-service', 'circular-dependency',
      'reverse-dependency', 'wrong-layer-placement', 'layer-skip-violation',
      'anemic-domain-model', 'domain-external-dependency', 'aggregate-boundary-violation',
    ]),
  },
  security: {
    nameKo: '보안',
    weight: 15,
    types: new Set([
      'hardcoded-secret', 'sql-injection', 'sensitive-logging', 'missing-auth',
      'missing-rate-limiting', 'missing-cors-config',
    ]),
  },
  testing: {
    nameKo: '테스트',
    weight: 15,
    types: new Set([
      'testing', 'missing-service-test', 'missing-controller-test', 'missing-integration-test',
    ]),
  },
  resilience: {
    nameKo: '장애 대응',
    weight: 15,
    types: new Set([
      'missing-circuit-breaker', 'missing-timeout', 'missing-retry', 'missing-fallback',
    ]),
  },
  observability: {
    nameKo: '관측성',
    weight: 10,
    types: new Set([
      'missing-custom-metrics', 'missing-request-tracing', 'missing-health-check', 'unstructured-logging',
    ]),
  },
  performance: {
    nameKo: '성능',
    weight: 10,
    types: new Set([
      'n-plus-one', 'select-star', 'like-leading-wildcard', 'findall-without-pagination', 'missing-index-hint',
      'missing-cache-annotation', 'cacheable-candidate', 'distributed-cache-candidate',
      'readonly-transaction', 'missing-pagination',
      'mutable-singleton-state', 'sync-external-call', 'unsafe-shared-resource',
    ]),
  },
  codeQuality: {
    nameKo: '코드 품질',
    weight: 10,
    types: new Set([
      'raw-exception', 'no-dto', 'missing-validation', 'missing-transactional',
      'controller-transaction', 'error-handling',
    ]),
  },
  production: {
    nameKo: '프로덕션 준비',
    weight: 5,
    types: new Set([
      'missing-api-docs', 'missing-db-migration', 'missing-graceful-shutdown',
      'inconsistent-response', 'missing-status-code',
    ]),
  },
};

// Penalty per issue (how much each issue deducts from category score)
const SEVERITY_PENALTY: Record<string, number> = {
  high: 25,
  medium: 15,
  low: 8,
};

export function calculateMaturityScore(opportunities: CodeOpportunity[]): MaturityScore {
  const categories: CategoryScore[] = [];

  for (const [catKey, catDef] of Object.entries(CATEGORY_MAP)) {
    const issues = opportunities.filter(o => catDef.types.has(o.type));
    const issueCount = issues.length;

    // Calculate penalty
    let penalty = 0;
    for (const issue of issues) {
      penalty += SEVERITY_PENALTY[issue.severity] ?? 10;
    }

    // Cap penalty at 100
    const score = Math.max(0, 100 - Math.min(penalty, 100));

    // Find top issue (highest portfolioValue)
    const topIssue = issues.sort((a, b) => b.portfolioValue - a.portfolioValue)[0];

    categories.push({
      name: catKey,
      nameKo: catDef.nameKo,
      score,
      maxScore: 100,
      issueCount,
      topIssue: topIssue?.current,
    });
  }

  // Weighted overall score
  const totalWeight = Object.values(CATEGORY_MAP).reduce((sum, c) => sum + c.weight, 0);
  const weightedSum = categories.reduce((sum, cat) => {
    const catDef = CATEGORY_MAP[cat.name];
    return sum + (cat.score * (catDef?.weight ?? 0));
  }, 0);
  const overall = Math.round(weightedSum / totalWeight);

  const grade = getGrade(overall);

  // Build improvement roadmap (sorted by portfolio impact)
  const roadmap = buildRoadmap(opportunities, categories);

  return { overall, grade, categories, roadmap };
}

function getGrade(score: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 95) return 'S';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

const FILE_COUNT_MAP: Record<string, number> = {
  'missing-circuit-breaker': 4,
  'mutable-singleton-state': 2,
  'missing-timeout': 2,
  'missing-db-migration': 3,
  'missing-api-docs': 2,
  'missing-rate-limiting': 3,
  'missing-graceful-shutdown': 1,
  'missing-cors-config': 1,
  'missing-custom-metrics': 3,
  'missing-request-tracing': 2,
  'missing-health-check': 2,
  'missing-retry': 2,
  'missing-fallback': 2,
  'sync-external-call': 3,
  'unsafe-shared-resource': 1,
  'unstructured-logging': 1,
};

function buildRoadmap(
  opportunities: CodeOpportunity[],
  categories: CategoryScore[],
): RoadmapItem[] {
  // Deduplicate by type (take highest portfolioValue instance)
  const byType = new Map<string, CodeOpportunity>();
  for (const opp of opportunities) {
    const existing = byType.get(opp.type);
    if (!existing || opp.portfolioValue > existing.portfolioValue) {
      byType.set(opp.type, opp);
    }
  }

  // Find which category each type belongs to
  const typeToCategory = new Map<string, string>();
  for (const [catKey, catDef] of Object.entries(CATEGORY_MAP)) {
    for (const t of catDef.types) {
      typeToCategory.set(t, catKey);
    }
  }

  // Sort by: portfolio value * category weight deficit
  const items: RoadmapItem[] = [];
  for (const [_type, opp] of byType) {
    const category = typeToCategory.get(opp.type) ?? 'codeQuality';
    const catScore = categories.find(c => c.name === category);
    const deficit = catScore ? (100 - catScore.score) : 50;

    // Composite priority: portfolioValue * deficit factor
    const impactScore = opp.portfolioValue * (1 + deficit / 100);

    let portfolioImpact: 'critical' | 'high' | 'medium';
    if (opp.portfolioValue >= 9) portfolioImpact = 'critical';
    else if (opp.portfolioValue >= 7) portfolioImpact = 'high';
    else portfolioImpact = 'medium';

    items.push({
      priority: 0, // will be set after sorting
      category,
      type: opp.type as OpportunityType,
      action: opp.suggestion,
      portfolioImpact,
      estimatedFiles: FILE_COUNT_MAP[opp.type] ?? 2,
    });
  }

  // Sort by impact score descending
  items.sort((a, b) => {
    const impactOrder = { critical: 3, high: 2, medium: 1 };
    return impactOrder[b.portfolioImpact] - impactOrder[a.portfolioImpact];
  });

  // Assign priority numbers
  return items.map((item, i) => ({ ...item, priority: i + 1 }));
}
