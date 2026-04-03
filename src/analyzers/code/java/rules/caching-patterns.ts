import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeCachingPatterns(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];

  detectMissingCacheAnnotation(filePath, content, opportunities);
  detectCacheableCandidate(filePath, content, context, opportunities);
  detectDistributedCacheCandidate(filePath, content, context, opportunities);

  return opportunities;
}

function detectMissingCacheAnnotation(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  // Check if project uses Spring Cache at all
  const hasCacheImport = /import\s+org\.springframework\.cache/.test(content);
  const hasCacheable = /@Cacheable|@CacheEvict|@CachePut|@Caching/.test(content);

  if (!hasCacheImport && !hasCacheable) return;

  // If caching is used in this file, check for @CacheEvict on write methods
  if (hasCacheable) {
    const isService = /@Service/.test(content);
    if (!isService) return;

    const writeMethods = content.match(
      /(?:public\s+\w[\w<>,\s]*\s+(?:save|update|delete|remove|create|modify)\w*\s*\([^)]*\)\s*\{)/g,
    );
    if (!writeMethods) return;

    let missingEvict = 0;
    for (const method of writeMethods) {
      const methodStart = content.indexOf(method);
      const preceding = content.substring(Math.max(0, methodStart - 200), methodStart);
      if (!/@CacheEvict|@CachePut|@Caching/.test(preceding)) {
        missingEvict++;
      }
    }

    if (missingEvict > 0) {
      opportunities.push({
        type: 'missing-cache-annotation',
        severity: 'medium',
        file: filePath,
        current: `캐시를 사용하는 Service에서 쓰기 메서드 ${missingEvict}개에 @CacheEvict가 없습니다`,
        suggestion: '데이터 변경 시 @CacheEvict로 캐시를 무효화하세요. 캐시 불일치로 인한 버그를 방지합니다',
        portfolioValue: 7,
        keywords: ['Spring Cache', '@CacheEvict', '캐시 일관성', '데이터 정합성'],
      });
    }
  }
}

function detectCacheableCandidate(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isService = /@Service/.test(content);
  if (!isService) return;

  // Skip if already uses caching
  if (/@Cacheable/.test(content)) return;

  // Look for patterns that suggest caching would help:
  // 1. Read-only methods with @Transactional(readOnly=true)
  // 2. findById / getById patterns (single entity lookups)
  // 3. Config/reference data loading (findAll for small tables)

  const readOnlyMethods = content.match(/@Transactional\s*\(\s*readOnly\s*=\s*true\s*\)/g);
  const findByIdCalls = content.match(/\.findById\s*\(|\.getById\s*\(|\.getReferenceById\s*\(/g);
  const configLoads = content.match(/\.findAll\s*\(\s*\)/g);

  const readOnlyCount = readOnlyMethods?.length ?? 0;
  const findByIdCount = findByIdCalls?.length ?? 0;
  const configLoadCount = configLoads?.length ?? 0;

  // Heuristic: if multiple read patterns exist, caching is likely beneficial
  const totalReadSignals = readOnlyCount + findByIdCount + configLoadCount;

  if (totalReadSignals >= 3) {
    const reasons: string[] = [];
    if (readOnlyCount > 0) reasons.push(`readOnly 메서드 ${readOnlyCount}개`);
    if (findByIdCount > 0) reasons.push(`findById 호출 ${findByIdCount}개`);
    if (configLoadCount > 0) reasons.push(`findAll() 호출 ${configLoadCount}개`);

    opportunities.push({
      type: 'cacheable-candidate',
      severity: 'medium',
      file: filePath,
      current: `읽기 위주 패턴이 감지되었습니다: ${reasons.join(', ')}`,
      suggestion: 'Spring Cache(@Cacheable)를 도입하세요. 반복 조회를 캐싱하면 DB 부하를 크게 줄일 수 있습니다. Caffeine(로컬) 캐시부터 시작을 권장합니다',
      portfolioValue: 8,
      keywords: ['Spring Cache', 'Caffeine', '캐싱 전략', '성능 최적화'],
    });
  }
}

function detectDistributedCacheCandidate(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  // Check if project shows signs of distributed deployment
  const hasDistributedSignals =
    content.includes('@EnableDiscoveryClient') ||
    content.includes('@EnableEurekaClient') ||
    content.includes('spring.redis') ||
    content.includes('spring.kafka') ||
    content.includes('@EnableFeignClients') ||
    content.includes('spring.cloud');

  if (!hasDistributedSignals) return;

  // Check if using local cache (Caffeine, ConcurrentMap) without distributed cache
  const hasLocalCache = /@Cacheable/.test(content) || /CaffeineCacheManager|ConcurrentMapCacheManager/.test(content);
  const hasDistributedCache = /RedisCacheManager|RedisTemplate|HazelcastCacheManager/.test(content);

  if (hasLocalCache && !hasDistributedCache) {
    opportunities.push({
      type: 'distributed-cache-candidate',
      severity: 'medium',
      file: filePath,
      current: '분산 환경 신호가 감지되었지만 로컬 캐시만 사용 중입니다',
      suggestion: 'Redis/Hazelcast 등 분산 캐시를 도입하세요. 다중 인스턴스 환경에서 로컬 캐시는 인스턴스 간 불일치를 유발합니다',
      portfolioValue: 7,
      keywords: ['Redis', '분산 캐시', 'Spring Cache', '마이크로서비스'],
    });
  }
}
