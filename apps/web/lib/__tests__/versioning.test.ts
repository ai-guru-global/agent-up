import { describe, it, expect } from "vitest";
import { bumpVersion, parseVersion, formatVersion, type Partition } from "@/lib/versioning";

describe("parseVersion", () => {
  it("parses valid semver", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it("returns null for invalid or empty", () => {
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("v1.2.3")).toBeNull();
  });
});

describe("formatVersion", () => {
  it("formats semver", () => {
    expect(formatVersion({ major: 1, minor: 2, patch: 3 })).toBe("1.2.3");
    expect(formatVersion({ major: 0, minor: 1, patch: 0 })).toBe("0.1.0");
  });
});

describe("bumpVersion", () => {
  it("first release -> 0.1.0", () => {
    expect(bumpVersion(null, ["PROMPT"])).toEqual({ major: 0, minor: 1, patch: 0 });
    expect(bumpVersion(undefined, ["KNOWLEDGE"])).toEqual({ major: 0, minor: 1, patch: 0 });
  });

  it("first release ignores partition count", () => {
    expect(bumpVersion(null, ["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"])).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
    });
  });

  it("single non-routing partition change -> patch bump", () => {
    expect(bumpVersion("0.1.0", ["PROMPT"])).toEqual({ major: 0, minor: 1, patch: 1 });
    expect(bumpVersion("1.2.3", ["KNOWLEDGE"])).toEqual({ major: 1, minor: 2, patch: 4 });
    expect(bumpVersion("2.5.7", ["TOOLS"])).toEqual({ major: 2, minor: 5, patch: 8 });
  });

  it("routing partition change -> minor bump", () => {
    expect(bumpVersion("0.1.0", ["ROUTING"])).toEqual({ major: 0, minor: 2, patch: 0 });
    expect(bumpVersion("1.5.3", ["ROUTING"])).toEqual({ major: 1, minor: 6, patch: 0 });
  });

  it("two or more partition changes -> minor bump", () => {
    expect(bumpVersion("0.1.0", ["PROMPT", "KNOWLEDGE"])).toEqual({
      major: 0,
      minor: 2,
      patch: 0,
    });
    expect(bumpVersion("1.0.5", ["TOOLS", "ROUTING"])).toEqual({
      major: 1,
      minor: 1,
      patch: 0,
    });
  });

  it("all four partitions -> minor bump (not major)", () => {
    const all: Partition[] = ["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"];
    expect(bumpVersion("0.1.0", all)).toEqual({ major: 0, minor: 2, patch: 0 });
  });

  it("dedupes partitions", () => {
    expect(bumpVersion("0.1.0", ["PROMPT", "PROMPT"])).toEqual({
      major: 0,
      minor: 1,
      patch: 1,
    });
  });

  it("zero partitions -> conservative patch", () => {
    expect(bumpVersion("0.1.0", [])).toEqual({ major: 0, minor: 1, patch: 1 });
  });

  it("invalid current treated as first release", () => {
    expect(bumpVersion("garbage", ["PROMPT"])).toEqual({ major: 0, minor: 1, patch: 0 });
  });
});
