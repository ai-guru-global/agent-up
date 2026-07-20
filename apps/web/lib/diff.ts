type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface DiffResult {
  added: Record<string, JsonValue>;
  removed: Record<string, JsonValue>;
  changed: Record<string, { before: JsonValue; after: JsonValue }>;
}

export function computeJsonDiff(before: unknown, after: unknown): DiffResult {
  const result: DiffResult = { added: {}, removed: {}, changed: {} };

  const a = (before && typeof before === "object" && !Array.isArray(before))
    ? before as Record<string, JsonValue>
    : {};
  const b = (after && typeof after === "object" && !Array.isArray(after))
    ? after as Record<string, JsonValue>
    : {};

  for (const key of Object.keys(a)) {
    if (!(key in b)) {
      result.removed[key] = a[key];
    } else if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      result.changed[key] = { before: a[key], after: b[key] };
    }
  }

  for (const key of Object.keys(b)) {
    if (!(key in a)) {
      result.added[key] = b[key];
    }
  }

  return result;
}
