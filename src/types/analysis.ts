import type { Commit, Significance, Severity } from './index.js';

export type StoryType = 'troubleshooting' | 'refactoring' | 'architecture' | 'optimization';

export interface GitStory {
  type: StoryType;
  title: string;
  commits: Commit[];
  files: string[];
  duration: string;
  significance: Significance;
}

export interface GitAnalysis {
  stories: GitStory[];
  stats: {
    avgCommitsPerDay: number;
    topChangedFiles: string[];
    refactorRatio: number;
  };
}

export type OpportunityType =
  // Java/Kotlin Spring Boot — general
  | 'error-handling'
  | 'testing'
  | 'fat-controller'
  | 'raw-exception'
  | 'no-dto'
  | 'missing-validation'
  | 'n-plus-one'
  | 'api-structure'
  // Transaction patterns
  | 'missing-transactional'
  | 'readonly-transaction'
  | 'controller-transaction'
  // Security patterns
  | 'hardcoded-secret'
  | 'sql-injection'
  | 'sensitive-logging'
  | 'missing-auth'
  // Layer architecture
  | 'missing-service-layer'
  | 'god-service'
  | 'circular-dependency'
  // Test coverage
  | 'missing-service-test'
  | 'missing-controller-test'
  | 'missing-integration-test'
  // API design
  | 'missing-pagination'
  | 'inconsistent-response'
  | 'missing-status-code'
  // Architecture conformance — Layered
  | 'reverse-dependency'
  | 'wrong-layer-placement'
  | 'layer-skip-violation'
  // Architecture conformance — DDD
  | 'anemic-domain-model'
  | 'domain-external-dependency'
  | 'aggregate-boundary-violation'
  // Query optimization
  | 'select-star'
  | 'like-leading-wildcard'
  | 'findall-without-pagination'
  | 'missing-index-hint'
  // Caching patterns
  | 'missing-cache-annotation'
  | 'cacheable-candidate'
  | 'distributed-cache-candidate'
  // Concurrency safety
  | 'mutable-singleton-state'
  | 'sync-external-call'
  | 'unsafe-shared-resource'
  // Resilience patterns
  | 'missing-circuit-breaker'
  | 'missing-timeout'
  | 'missing-retry'
  | 'missing-fallback'
  // Observability patterns
  | 'missing-custom-metrics'
  | 'missing-request-tracing'
  | 'missing-health-check'
  | 'unstructured-logging'
  // Production readiness
  | 'missing-api-docs'
  | 'missing-db-migration'
  | 'missing-cors-config'
  | 'missing-rate-limiting'
  | 'missing-graceful-shutdown';

export interface CodeOpportunity {
  type: OpportunityType;
  severity: Severity;
  file: string;
  line?: number;
  current: string;
  suggestion: string;
  portfolioValue: number;
  keywords: string[];
}

export interface CodeAnalysis {
  opportunities: CodeOpportunity[];
  maturity?: {
    overall: number;
    grade: string;
    categories: Array<{
      name: string;
      nameKo: string;
      score: number;
      maxScore: number;
      issueCount: number;
      topIssue?: string;
    }>;
    roadmap: Array<{
      priority: number;
      category: string;
      type: string;
      action: string;
      portfolioImpact: string;
      estimatedFiles: number;
    }>;
  };
}

export interface RankedOpportunity {
  rank: number;
  type: string;
  title: string;
  portfolioValue: number;
  expectedNarrative: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedFiles: number;
}
