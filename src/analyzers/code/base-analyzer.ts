import type { CodeOpportunity } from '../../types/analysis.js';
import type { SpringConventions } from '../../config/conventions.js';

export interface AnalyzerContext {
  projectPath: string;
  files: string[];
  conventions?: SpringConventions;
}

export interface CodeAnalyzer {
  name: string;
  analyze(context: AnalyzerContext): Promise<CodeOpportunity[]>;
}

export interface ArchitectureInfo {
  detected: 'layered' | 'ddd' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  layers: DetectedLayer[];
}

export interface DetectedLayer {
  name: string;
  packagePath: string;
  classes: string[];
}

/** Cross-file context built from a first-pass scan of all Java/Kotlin files */
export interface JavaProjectContext {
  hasControllerAdvice: boolean;
  globalExceptionTypes: string[];
  serviceClasses: string[];
  repositoryInterfaces: string[];
  entityClasses: string[];
  dtoClasses: string[];
  hasSecurityConfig: boolean;
  testFileMap: Map<string, string>;
  architecture: ArchitectureInfo;
  packageStructure: Map<string, string[]>;
  // Async context
  hasEnableAsync: boolean;
  hasAsyncConfigurer: boolean;
  asyncMethods: Map<string, string[]>;
  hasSchedulingConfig: boolean;
  scheduledMethodCount: number;
  hasAsyncExceptionHandler: boolean;
  isReactiveProject: boolean;
}
