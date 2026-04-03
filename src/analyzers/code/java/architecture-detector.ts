import type { ArchitectureInfo, DetectedLayer } from '../base-analyzer.js';
import type { SpringConventions } from '../../../config/conventions.js';

interface PackageInfo {
  packagePath: string;
  classes: string[];
}

const LAYERED_INDICATORS: Record<string, string[]> = {
  controller: ['controller', 'web', 'api', 'rest'],
  service: ['service', 'application', 'usecase'],
  repository: ['repository', 'dao', 'persistence', 'infra.persistence'],
  domain: ['entity', 'model', 'domain'],
};

const DDD_INDICATORS = {
  domain: ['domain'],
  application: ['application', 'usecase'],
  infrastructure: ['infrastructure', 'infra'],
};

export function detectArchitecture(
  packageStructure: Map<string, string[]>,
  conventions: SpringConventions,
): ArchitectureInfo {
  const archType = conventions.architecture?.type ?? 'auto';

  if (archType !== 'auto') {
    if (archType === 'layered') {
      return buildLayeredInfo(packageStructure, 'high');
    }
    if (archType === 'ddd') {
      return buildDddInfo(packageStructure, 'high');
    }
  }

  // Auto-detect: try DDD first (more specific), then Layered
  const dddScore = scoreDdd(packageStructure);
  const layeredScore = scoreLayered(packageStructure);

  if (dddScore >= 3) {
    const confidence = dddScore >= 3 ? 'high' : 'medium';
    return buildDddInfo(packageStructure, confidence);
  }

  if (layeredScore >= 3) {
    const confidence = layeredScore >= 4 ? 'high' : layeredScore >= 3 ? 'medium' : 'low';
    return buildLayeredInfo(packageStructure, confidence);
  }

  return { detected: 'unknown', confidence: 'low', layers: [] };
}

function scoreLayered(packageStructure: Map<string, string[]>): number {
  let score = 0;
  const packages = [...packageStructure.keys()];

  for (const [_layer, indicators] of Object.entries(LAYERED_INDICATORS)) {
    const found = packages.some(pkg =>
      indicators.some(ind => {
        const segments = pkg.split('.');
        return segments.some(seg => seg === ind);
      }),
    );
    if (found) score++;
  }

  return score;
}

function scoreDdd(packageStructure: Map<string, string[]>): number {
  let score = 0;
  const packages = [...packageStructure.keys()];

  for (const [_layer, indicators] of Object.entries(DDD_INDICATORS)) {
    const found = packages.some(pkg =>
      indicators.some(ind => {
        const segments = pkg.split('.');
        return segments.some(seg => seg === ind);
      }),
    );
    if (found) score++;
  }

  return score;
}

function buildLayeredInfo(
  packageStructure: Map<string, string[]>,
  confidence: 'high' | 'medium' | 'low',
): ArchitectureInfo {
  const layers: DetectedLayer[] = [];

  for (const [layerName, indicators] of Object.entries(LAYERED_INDICATORS)) {
    for (const [pkg, classes] of packageStructure) {
      const segments = pkg.split('.');
      if (indicators.some(ind => segments.some(seg => seg === ind))) {
        layers.push({ name: layerName, packagePath: pkg, classes });
      }
    }
  }

  return { detected: 'layered', confidence, layers };
}

function buildDddInfo(
  packageStructure: Map<string, string[]>,
  confidence: 'high' | 'medium' | 'low',
): ArchitectureInfo {
  const layers: DetectedLayer[] = [];

  for (const [layerName, indicators] of Object.entries(DDD_INDICATORS)) {
    for (const [pkg, classes] of packageStructure) {
      const segments = pkg.split('.');
      if (indicators.some(ind => segments.some(seg => seg === ind))) {
        layers.push({ name: layerName, packagePath: pkg, classes });
      }
    }
  }

  return { detected: 'ddd', confidence, layers };
}
