/** Project-level Spring conventions loaded from .spring-conventions.json */

export interface LayerConvention {
  name: string;
  packagePattern: string;
  canDependOn: string[];
}

export interface SpringConventions {
  architecture?: {
    type: 'layered' | 'ddd' | 'auto';
    layers?: LayerConvention[];
  };
  thresholds?: {
    controllerMaxLines?: number;
    serviceMaxLines?: number;
    serviceMaxDependencies?: number;
    serviceMaxMethods?: number;
  };
  naming?: {
    controllerSuffix?: string;
    serviceSuffix?: string;
    repositorySuffix?: string;
    dtoSuffix?: string[];
    entityPackage?: string;
  };
  rules?: {
    disabled?: string[];
    severityOverrides?: Record<string, 'high' | 'medium' | 'low'>;
  };
}

export const DEFAULT_CONVENTIONS: Required<SpringConventions> = {
  architecture: {
    type: 'auto',
    layers: [
      { name: 'controller', packagePattern: '*.controller', canDependOn: ['service'] },
      { name: 'service', packagePattern: '*.service', canDependOn: ['repository', 'domain'] },
      { name: 'repository', packagePattern: '*.repository', canDependOn: ['domain'] },
      { name: 'domain', packagePattern: '*.domain', canDependOn: [] },
    ],
  },
  thresholds: {
    controllerMaxLines: 200,
    serviceMaxLines: 500,
    serviceMaxDependencies: 8,
    serviceMaxMethods: 15,
  },
  naming: {
    controllerSuffix: 'Controller',
    serviceSuffix: 'Service',
    repositorySuffix: 'Repository',
    dtoSuffix: ['Dto', 'DTO', 'Response', 'Request'],
    entityPackage: 'entity',
  },
  rules: {
    disabled: [],
    severityOverrides: {},
  },
};
