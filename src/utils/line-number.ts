export function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}
