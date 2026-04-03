import type { CodeOpportunity } from '../../../../types/analysis.js';
import type { JavaProjectContext } from '../../base-analyzer.js';
import type { SpringConventions } from '../../../../config/conventions.js';

export function analyzeArchitectureConformance(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  conventions: SpringConventions,
): CodeOpportunity[] {
  const opportunities: CodeOpportunity[] = [];
  const arch = context.architecture;

  if (arch.detected === 'unknown') return opportunities;

  if (arch.detected === 'layered') {
    detectReverseDependency(filePath, content, context, conventions, opportunities);
    detectWrongLayerPlacement(filePath, content, context, opportunities);
    detectLayerSkipViolation(filePath, content, context, conventions, opportunities);
  }

  if (arch.detected === 'ddd') {
    detectAnemicDomainModel(filePath, content, context, opportunities);
    detectDomainExternalDependency(filePath, content, context, opportunities);
    detectAggregateBoundaryViolation(filePath, content, opportunities);
  }

  return opportunities;
}

// --- Layered Architecture Violations ---

const LAYER_ORDER = ['controller', 'service', 'repository', 'domain'];

function getLayerForPackage(pkg: string, context: JavaProjectContext): string | undefined {
  for (const layer of context.architecture.layers) {
    if (pkg.includes(layer.packagePath) || layer.packagePath.includes(pkg)) {
      return layer.name;
    }
    // Check by segment match
    const layerSegments = layer.name.toLowerCase();
    const pkgSegments = pkg.split('.');
    if (pkgSegments.some(seg => seg === layerSegments)) {
      return layer.name;
    }
  }
  return undefined;
}

function getLayerForFile(filePath: string, content: string, context: JavaProjectContext): string | undefined {
  const packageMatch = content.match(/^package\s+([\w.]+);/m);
  if (packageMatch) {
    const layer = getLayerForPackage(packageMatch[1], context);
    if (layer) return layer;
  }

  // Fallback: check file path segments
  const pathLower = filePath.toLowerCase();
  for (const layer of context.architecture.layers) {
    if (pathLower.includes(`/${layer.name}/`)) return layer.name;
  }
  return undefined;
}

function detectReverseDependency(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  _conventions: SpringConventions,
  opportunities: CodeOpportunity[],
): void {
  const currentLayer = getLayerForFile(filePath, content, context);
  if (!currentLayer) return;

  const currentIndex = LAYER_ORDER.indexOf(currentLayer);
  if (currentIndex < 0) return;

  const imports = content.match(/^import\s+([\w.]+);/gm);
  if (!imports) return;

  for (const imp of imports) {
    const pkgMatch = imp.match(/^import\s+([\w.]+)\.\w+;/);
    if (!pkgMatch) continue;

    const importPkg = pkgMatch[1];
    const importLayer = getLayerForPackage(importPkg, context);
    if (!importLayer) continue;

    const importIndex = LAYER_ORDER.indexOf(importLayer);
    if (importIndex < 0) continue;

    // Lower layer (higher index) importing upper layer (lower index) = reverse dependency
    if (currentIndex > importIndex) {
      opportunities.push({
        type: 'reverse-dependency',
        severity: 'high',
        file: filePath,
        current: `${currentLayer} 레이어가 ${importLayer} 레이어를 import하고 있습니다 (역방향 의존)`,
        suggestion: `하위 레이어는 상위 레이어에 의존하면 안 됩니다. 인터페이스를 통한 의존성 역전(DIP)을 적용하세요`,
        portfolioValue: 9,
        keywords: ['레이어드 아키텍처', 'DIP', '의존성 역전', '클린 아키텍처'],
      });
      return;
    }
  }
}

function detectWrongLayerPlacement(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const currentLayer = getLayerForFile(filePath, content, context);
  if (!currentLayer) return;

  const classNameMatch = content.match(/class\s+(\w+)/);
  if (!classNameMatch) return;
  const className = classNameMatch[1];

  // @Service in controller package
  if (currentLayer === 'controller' && /@Service/.test(content)) {
    opportunities.push({
      type: 'wrong-layer-placement',
      severity: 'medium',
      file: filePath,
      current: `${className}에 @Service가 있지만 controller 패키지에 위치합니다`,
      suggestion: 'Service 클래스는 service 패키지로 이동하세요. 레이어별 패키지 구조를 유지해야 합니다',
      portfolioValue: 7,
      keywords: ['패키지 구조', '레이어드 아키텍처', '코드 구조'],
    });
    return;
  }

  // @Controller in service package
  if (currentLayer === 'service' && /@(Rest)?Controller/.test(content)) {
    opportunities.push({
      type: 'wrong-layer-placement',
      severity: 'medium',
      file: filePath,
      current: `${className}에 @Controller가 있지만 service 패키지에 위치합니다`,
      suggestion: 'Controller 클래스는 controller 패키지로 이동하세요',
      portfolioValue: 7,
      keywords: ['패키지 구조', '레이어드 아키텍처', '코드 구조'],
    });
    return;
  }

  // @Entity in controller/service package
  if ((currentLayer === 'controller' || currentLayer === 'service') && /@Entity/.test(content)) {
    opportunities.push({
      type: 'wrong-layer-placement',
      severity: 'medium',
      file: filePath,
      current: `${className}에 @Entity가 있지만 ${currentLayer} 패키지에 위치합니다`,
      suggestion: 'Entity 클래스는 domain/entity 패키지로 이동하세요',
      portfolioValue: 7,
      keywords: ['패키지 구조', '레이어드 아키텍처', '도메인 모델'],
    });
  }
}

function detectLayerSkipViolation(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  conventions: SpringConventions,
  opportunities: CodeOpportunity[],
): void {
  const currentLayer = getLayerForFile(filePath, content, context);
  if (!currentLayer) return;

  const layerDefs = conventions.architecture?.layers;
  if (!layerDefs || layerDefs.length === 0) return;

  const currentDef = layerDefs.find(l => l.name === currentLayer);
  if (!currentDef) return;

  const imports = content.match(/^import\s+([\w.]+);/gm);
  if (!imports) return;

  for (const imp of imports) {
    const pkgMatch = imp.match(/^import\s+([\w.]+)\.\w+;/);
    if (!pkgMatch) continue;

    const importPkg = pkgMatch[1];
    const importLayer = getLayerForPackage(importPkg, context);
    if (!importLayer || importLayer === currentLayer) continue;

    if (!currentDef.canDependOn.includes(importLayer)) {
      opportunities.push({
        type: 'layer-skip-violation',
        severity: 'high',
        file: filePath,
        current: `${currentLayer} 레이어가 ${importLayer} 레이어에 직접 의존합니다 (허용: ${currentDef.canDependOn.join(', ') || 'none'})`,
        suggestion: `conventions에 정의된 레이어 의존 규칙을 준수하세요. ${currentLayer}은 [${currentDef.canDependOn.join(', ')}]만 의존할 수 있습니다`,
        portfolioValue: 8,
        keywords: ['레이어 의존 규칙', '아키텍처 준수', '클린 아키텍처'],
      });
      return;
    }
  }
}

// --- DDD Violations ---

function detectAnemicDomainModel(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const isEntity = /@Entity/.test(content);
  if (!isEntity) return;

  // Only check files in domain layer
  const currentLayer = getLayerForFile(filePath, content, context);
  if (currentLayer && currentLayer !== 'domain') return;

  const classNameMatch = content.match(/class\s+(\w+)/);
  if (!classNameMatch) return;
  const className = classNameMatch[1];

  const publicMethods = content.match(/public\s+(?!(?:static|class|interface|enum)\b)\w[\w<>,\s]*\s+(\w+)\s*\(/g);
  if (!publicMethods) return;

  const methodNames = publicMethods.map(m => {
    const match = m.match(/\s+(\w+)\s*\($/);
    return match ? match[1] : '';
  }).filter(Boolean);

  // Count getter/setter vs business methods
  const getterSetterCount = methodNames.filter(name =>
    /^(?:get|set|is|has)[A-Z]/.test(name) ||
    name === 'toString' || name === 'equals' || name === 'hashCode',
  ).length;

  const businessMethodCount = methodNames.length - getterSetterCount;

  // If entity has methods but ALL are getters/setters → anemic
  if (methodNames.length >= 3 && businessMethodCount === 0) {
    opportunities.push({
      type: 'anemic-domain-model',
      severity: 'high',
      file: filePath,
      current: `${className} Entity에 getter/setter만 있고 비즈니스 메서드가 없습니다 (빈약한 도메인 모델)`,
      suggestion: '도메인 로직(상태 변경, 검증, 계산)을 Entity 내부로 이동하세요. DDD의 Rich Domain Model을 적용하면 비즈니스 규칙이 응집됩니다',
      portfolioValue: 8,
      keywords: ['DDD', 'Rich Domain Model', '빈약한 도메인', '도메인 주도 설계'],
    });
  }
}

function detectDomainExternalDependency(
  filePath: string,
  content: string,
  context: JavaProjectContext,
  opportunities: CodeOpportunity[],
): void {
  const currentLayer = getLayerForFile(filePath, content, context);
  if (currentLayer !== 'domain') return;

  const imports = content.match(/^import\s+([\w.]+);/gm);
  if (!imports) return;

  const infraImports: string[] = [];
  for (const imp of imports) {
    const pkgMatch = imp.match(/^import\s+([\w.]+);/);
    if (!pkgMatch) continue;
    const pkg = pkgMatch[1];

    // Domain should not import infrastructure/framework classes
    if (
      pkg.includes('.infrastructure.') ||
      pkg.includes('.infra.') ||
      pkg.includes('springframework.stereotype') ||
      pkg.includes('springframework.beans') ||
      pkg.includes('springframework.data.jpa') ||
      pkg.includes('springframework.web')
    ) {
      infraImports.push(pkg);
    }
  }

  if (infraImports.length > 0) {
    opportunities.push({
      type: 'domain-external-dependency',
      severity: 'high',
      file: filePath,
      current: `Domain 레이어가 Infrastructure/Framework를 직접 import합니다 (${infraImports.length}개)`,
      suggestion: 'Domain 레이어는 순수해야 합니다. Spring/JPA 의존을 제거하고, 인터페이스를 통해 Infrastructure와 소통하세요',
      portfolioValue: 9,
      keywords: ['DDD', '헥사고날 아키텍처', '도메인 순수성', '포트/어댑터'],
    });
  }
}

function detectAggregateBoundaryViolation(
  filePath: string,
  content: string,
  opportunities: CodeOpportunity[],
): void {
  const isEntity = /@Entity/.test(content);
  if (!isEntity) return;

  const classNameMatch = content.match(/class\s+(\w+)/);
  if (!classNameMatch) return;
  const className = classNameMatch[1];

  // Detect @ManyToOne, @OneToMany, @ManyToMany referencing other aggregates
  const jpaRelations = content.match(/@(?:ManyToOne|OneToMany|ManyToMany|OneToOne)\s*(?:\([^)]*\))?\s*(?:private\s+)?(?:List|Set|Collection)?\s*<?(\w+)>?\s+\w+/g);
  if (!jpaRelations) return;

  const referencedEntities: string[] = [];
  for (const rel of jpaRelations) {
    const entityMatch = rel.match(/(?:List|Set|Collection)\s*<\s*(\w+)\s*>|(?:private\s+)(\w+)\s+\w+$/);
    if (entityMatch) {
      const ref = entityMatch[1] ?? entityMatch[2];
      if (ref && ref !== className && !ref.startsWith('java.') && ref !== 'String') {
        referencedEntities.push(ref);
      }
    }
  }

  // Only flag if there are many cross-entity references (likely different aggregates)
  if (referencedEntities.length >= 3) {
    opportunities.push({
      type: 'aggregate-boundary-violation',
      severity: 'medium',
      file: filePath,
      current: `${className}이 ${referencedEntities.length}개 Entity를 직접 참조합니다: ${referencedEntities.join(', ')}`,
      suggestion: '다른 Aggregate는 ID로만 참조하세요. 직접 @ManyToOne 대신 aggregateId 필드를 사용하면 Aggregate 경계가 명확해집니다',
      portfolioValue: 7,
      keywords: ['DDD', 'Aggregate 경계', '느슨한 결합', '도메인 설계'],
    });
  }
}
