import { describe, it, expect } from "vitest";
import { computeJsonDiff } from "../diff";

describe("computeJsonDiff", () => {
  it("detects added keys", () => {
    const result = computeJsonDiff({}, { a: 1, b: "hello" });
    expect(result.added).toEqual({ a: 1, b: "hello" });
    expect(result.removed).toEqual({});
    expect(result.changed).toEqual({});
  });

  it("detects removed keys", () => {
    const result = computeJsonDiff({ a: 1, b: 2 }, { a: 1 });
    expect(result.removed).toEqual({ b: 2 });
    expect(result.added).toEqual({});
    expect(result.changed).toEqual({});
  });

  it("detects changed values", () => {
    const result = computeJsonDiff({ a: 1 }, { a: 2 });
    expect(result.changed).toEqual({ a: { before: 1, after: 2 } });
  });

  it("detects nested object changes", () => {
    const before = { config: { nested: true } };
    const after = { config: { nested: false } };
    const result = computeJsonDiff(before, after);
    expect(result.changed).toEqual({
      config: { before: { nested: true }, after: { nested: false } },
    });
  });

  it("handles null inputs gracefully", () => {
    const result = computeJsonDiff(null, null);
    expect(result).toEqual({ added: {}, removed: {}, changed: {} });
  });

  it("handles array inputs gracefully", () => {
    const result = computeJsonDiff([1, 2], [3, 4]);
    expect(result).toEqual({ added: {}, removed: {}, changed: {} });
  });

  it("handles mixed add/remove/change", () => {
    const before = { keep: "same", remove: 1, change: "old" };
    const after = { keep: "same", add: "new", change: "new" };
    const result = computeJsonDiff(before, after);
    expect(result.added).toEqual({ add: "new" });
    expect(result.removed).toEqual({ remove: 1 });
    expect(result.changed).toEqual({ change: { before: "old", after: "new" } });
  });

  it("no diff for identical objects", () => {
    const obj = { a: 1, b: "hello", c: [1, 2, 3] };
    const result = computeJsonDiff(obj, { ...obj });
    expect(result.added).toEqual({});
    expect(result.removed).toEqual({});
    expect(result.changed).toEqual({});
  });
});
