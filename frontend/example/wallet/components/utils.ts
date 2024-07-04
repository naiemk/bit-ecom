
export function unique<T>(ar: T[]) {
  return Array.from(new Set(ar));
}