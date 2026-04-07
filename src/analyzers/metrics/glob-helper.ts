import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.expo',
  'coverage', '.portfolio', '__pycache__', '.gradle', 'target',
  '.idea', '.vscode', '.omc',
]);

const SOURCE_EXTENSIONS = new Set([
  '.java', '.kt', '.xml', '.yml', '.yaml', '.properties', '.gradle', '.sql',
  '.ts', '.tsx', '.js', '.jsx',
]);

export async function glob(projectPath: string, maxFiles = 5000): Promise<string[]> {
  const results: string[] = [];
  await walkDir(projectPath, results, 0, maxFiles);
  return results;
}

async function walkDir(dir: string, results: string[], depth: number, maxFiles: number): Promise<void> {
  if (depth > 10) return;
  if (results.length >= maxFiles) return;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (results.length >= maxFiles) return;

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walkDir(fullPath, results, depth + 1, maxFiles);
        }
      } else if (entry.isFile()) {
        const ext = '.' + entry.name.split('.').pop();
        if (SOURCE_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Skip inaccessible directories
  }
}
