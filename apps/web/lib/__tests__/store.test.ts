import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { store, _getDataDir, generateId } from "@/lib/data/store";
import { AppError } from "@/lib/errors";
import {
  useTempDataDir,
  restoreDataDir,
} from "./helpers/mock-store";
import { writeFileSync } from "fs";
import { join } from "path";

beforeEach(useTempDataDir);
afterEach(restoreDataDir);

describe("store.read / write / list / delete", () => {
  it("returns null for missing file", () => {
    expect(store.read("nope", "missing.json")).toBeNull();
  });

  it("write then read round-trips an object", () => {
    const obj = { id: "x", name: "测试", nested: { a: 1 } };
    store.write(obj, "agents", "x.json");
    const got = store.read<typeof obj>("agents", "x.json");
    expect(got).toEqual(obj);
  });

  it("list reads all json files in a dir", () => {
    // 用独立目录避免与种子 agents 混淆
    store.write({ id: "1" }, "list-test", "1.json");
    store.write({ id: "2" }, "list-test", "2.json");
    store.write({ id: "3" }, "list-test", "3.txt"); // 非 json，应被忽略
    const list = store.list<{ id: string }>("list-test");
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.id).sort()).toEqual(["1", "2"]);
  });

  it("delete returns false for missing, true after delete", () => {
    expect(store.delete("agents", "ghost.json")).toBe(false);
    store.write({ id: "1" }, "agents", "1.json");
    expect(store.delete("agents", "1.json")).toBe(true);
    expect(store.read("agents", "1.json")).toBeNull();
  });

  it("write ensures parent dirs", () => {
    store.write({ id: "1" }, "wiki-vaults", "v1", "pages", "p1.json");
    expect(store.read("wiki-vaults", "v1", "pages", "p1.json")).toEqual({
      id: "1",
    });
  });
});

describe("store.readArray / writeArray", () => {
  it("returns [] for missing file", () => {
    expect(store.readArray("settings", "missing.json")).toEqual([]);
  });

  it("returns [] for non-array JSON", () => {
    store.write({ not: "array" }, "settings", "x.json");
    expect(store.readArray("settings", "x.json")).toEqual([]);
  });

  it("writeArray then readArray round-trips", () => {
    const arr = [{ id: "1" }, { id: "2" }];
    store.writeArray(arr, "settings", "arr.json");
    expect(store.readArray("settings", "arr.json")).toEqual(arr);
  });
});

describe("store queryList", () => {
  // 用独立目录避免与种子 agents 混淆
  const DIR = "query-test";

  beforeEach(() => {
    store.write({ id: "1", status: "ACTIVE", name: "Z" }, DIR, "1.json");
    store.write({ id: "2", status: "DRAFT", name: "A" }, DIR, "2.json");
    store.write({ id: "3", status: "ACTIVE", name: "M" }, DIR, "3.json");
  });

  it("filters, sorts, paginates", () => {
    const result = store.queryList<Record<string, unknown>>(
      [DIR],
      { status: (a) => a.status === "ACTIVE" },
      (a, b) => String(a.name).localeCompare(String(b.name)),
      0,
      10,
    );
    expect(result.total).toBe(2);
    expect(result.items.map((x) => x.name)).toEqual(["M", "Z"]);
  });

  it("paginates with skip/take", () => {
    const result = store.queryList<Record<string, unknown>>(
      [DIR],
      {},
      (a, b) => String(a.name).localeCompare(String(b.name)),
      1,
      1,
    );
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
  });
});

describe("store corruption handling", () => {
  it("read throws AppError (not raw SyntaxError) on corrupt JSON", () => {
    const dir = join(_getDataDir(), "agents");
    writeFileSync(join(dir, "corrupt.json"), "{ broken json");
    expect(() => store.read("agents", "corrupt.json")).toThrow(AppError);
    expect(() => store.read("agents", "corrupt.json")).toThrow(/数据文件损坏/);
  });

  it("list throws AppError on corrupt JSON", () => {
    writeFileSync(join(_getDataDir(), "agents", "bad.json"), "not json");
    expect(() => store.list("agents")).toThrow(AppError);
  });

  it("readArray throws AppError on corrupt JSON", () => {
    writeFileSync(join(_getDataDir(), "settings", "bad.json"), "not json");
    expect(() => store.readArray("settings", "bad.json")).toThrow(AppError);
  });
});

describe("generateId", () => {
  it("produces unique ids (uuid format)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateId());
    expect(ids.size).toBe(1000);
  });

  it("is a valid uuid", () => {
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
