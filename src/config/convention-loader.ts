import { readFile } from 'fs/promises';
import path from 'path';
import { DEFAULT_CONVENTIONS } from './conventions.js';
import type { SpringConventions } from './conventions.js';

const CONVENTIONS_FILE = '.spring-conventions.json';

export async function loadConventions(projectPath: string): Promise<SpringConventions> {
  const filePath = path.join(projectPath, CONVENTIONS_FILE);

  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SpringConventions>;

    return mergeConventions(parsed);
  } catch {
    return DEFAULT_CONVENTIONS;
  }
}

function mergeConventions(overrides: Partial<SpringConventions>): SpringConventions {
  return {
    architecture: {
      ...DEFAULT_CONVENTIONS.architecture,
      ...overrides.architecture,
    },
    thresholds: {
      ...DEFAULT_CONVENTIONS.thresholds,
      ...overrides.thresholds,
    },
    naming: {
      ...DEFAULT_CONVENTIONS.naming,
      ...overrides.naming,
    },
    rules: {
      ...DEFAULT_CONVENTIONS.rules,
      ...overrides.rules,
    },
  };
}
