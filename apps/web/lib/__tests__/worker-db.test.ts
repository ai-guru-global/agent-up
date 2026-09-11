import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
import { _resetDb } from "@/lib/data/test-db";

describe("worker 专属测试库", () => {
  beforeEach(_resetDb);

  it("DATABASE_URL 指向本 worker 专属库", () => {
    expect(process.env.DATABASE_URL).toMatch(/\/agentup_test_w\d+/);
  });

  it("建行可查、_resetDb 可清（隔离冒烟）", async () => {
    await prisma.productGroup.create({
      data: { id: "pg-iso", name: "iso-group", displayName: "隔离冒烟组" },
    });
    expect(await prisma.productGroup.findUnique({ where: { id: "pg-iso" } })).not.toBeNull();
    await _resetDb();
    expect(await prisma.productGroup.findUnique({ where: { id: "pg-iso" } })).toBeNull();
  });
});
