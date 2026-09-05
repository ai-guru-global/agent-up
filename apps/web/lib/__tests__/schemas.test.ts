import { describe, it, expect } from "vitest";
import {
  createAgentSchema,
  createSkillSchema,
  bindSkillSchema,
  createWikiVaultSchema,
  createWikiPageSchema,
  createRoleSchema,
  createPermissionSchema,
  createProductGroupSchema,
  reviewReleaseSchema,
  submitReleaseSchema,
  createFeedbackSchema,
  updateFeedbackSchema,
} from "@/lib/schemas";

describe("createAgentSchema", () => {
  it("accepts valid input", () => {
    const r = createAgentSchema.safeParse({
      name: "A",
      productGroupId: "g1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty name", () => {
    const r = createAgentSchema.safeParse({ name: "", productGroupId: "g1" });
    expect(r.success).toBe(false);
  });

  it("rejects missing productGroupId", () => {
    const r = createAgentSchema.safeParse({ name: "A" });
    expect(r.success).toBe(false);
  });
});

describe("createSkillSchema", () => {
  it("accepts valid input", () => {
    const r = createSkillSchema.safeParse({
      name: "s",
      displayName: "S",
      description: "d",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid category enum", () => {
    const r = createSkillSchema.safeParse({
      name: "s",
      displayName: "S",
      description: "d",
      category: "BOGUS",
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid runtime enum", () => {
    const r = createSkillSchema.safeParse({
      name: "s",
      displayName: "S",
      description: "d",
      runtime: "BOGUS",
    });
    expect(r.success).toBe(false);
  });

  it("accepts valid runtime + category", () => {
    const r = createSkillSchema.safeParse({
      name: "s",
      displayName: "S",
      description: "d",
      category: "DATA_FETCH",
      runtime: "MCP",
    });
    expect(r.success).toBe(true);
  });
});

describe("bindSkillSchema", () => {
  it("requires skillId", () => {
    expect(bindSkillSchema.safeParse({}).success).toBe(false);
    expect(bindSkillSchema.safeParse({ skillId: "x" }).success).toBe(true);
    expect(
      bindSkillSchema.safeParse({ skillId: "x", config: { a: 1 } }).success,
    ).toBe(true);
  });
});

describe("createWikiVaultSchema", () => {
  it("requires name", () => {
    expect(createWikiVaultSchema.safeParse({}).success).toBe(false);
  });

  it("rejects malformed gitRepoUrl", () => {
    expect(
      createWikiVaultSchema.safeParse({ name: "v", gitRepoUrl: "not-a-url" })
        .success,
    ).toBe(false);
  });

  it("accepts empty string gitRepoUrl (optional)", () => {
    expect(
      createWikiVaultSchema.safeParse({ name: "v", gitRepoUrl: "" }).success,
    ).toBe(true);
  });

  it("accepts valid url", () => {
    expect(
      createWikiVaultSchema.safeParse({
        name: "v",
        gitRepoUrl: "https://github.com/x/y",
      }).success,
    ).toBe(true);
  });
});

describe("createWikiPageSchema", () => {
  it("requires vaultId, title, slug, content", () => {
    expect(createWikiPageSchema.safeParse({ title: "t" }).success).toBe(false);
  });

  it("accepts minimal valid", () => {
    expect(
      createWikiPageSchema.safeParse({
        vaultId: "v1",
        title: "t",
        slug: "s",
        content: "c",
      }).success,
    ).toBe(true);
  });

  it("validates baseConfidence range", () => {
    expect(
      createWikiPageSchema.safeParse({
        vaultId: "v1",
        title: "t",
        slug: "s",
        content: "c",
        baseConfidence: 1.5,
      }).success,
    ).toBe(false);
  });

  it("validates tier enum", () => {
    expect(
      createWikiPageSchema.safeParse({
        vaultId: "v1",
        title: "t",
        slug: "s",
        content: "c",
        tier: "BOGUS",
      }).success,
    ).toBe(false);
    expect(
      createWikiPageSchema.safeParse({
        vaultId: "v1",
        title: "t",
        slug: "s",
        content: "c",
        tier: "CORE",
      }).success,
    ).toBe(true);
  });
});

describe("settings schemas", () => {
  it("createRoleSchema requires name + displayName", () => {
    expect(createRoleSchema.safeParse({ name: "r" }).success).toBe(false);
    expect(
      createRoleSchema.safeParse({ name: "r", displayName: "R" }).success,
    ).toBe(true);
  });

  it("createPermissionSchema requires resource + action", () => {
    expect(createPermissionSchema.safeParse({ resource: "r" }).success).toBe(
      false,
    );
    expect(
      createPermissionSchema.safeParse({ resource: "r", action: "read" })
        .success,
    ).toBe(true);
  });

  it("createProductGroupSchema requires name + displayName", () => {
    expect(createProductGroupSchema.safeParse({}).success).toBe(false);
    expect(
      createProductGroupSchema.safeParse({ name: "g", displayName: "G" })
        .success,
    ).toBe(true);
  });
});

describe("release schemas", () => {
  it("reviewReleaseSchema requires releaseId + action", () => {
    expect(reviewReleaseSchema.safeParse({ action: "APPROVED" }).success).toBe(
      false,
    );
    expect(
      reviewReleaseSchema.safeParse({
        releaseId: "r1",
        action: "APPROVED",
      }).success,
    ).toBe(true);
  });

  it("reviewReleaseSchema rejects invalid action", () => {
    expect(
      reviewReleaseSchema.safeParse({ releaseId: "r1", action: "BOGUS" })
        .success,
    ).toBe(false);
  });

  it("submitReleaseSchema requires changeNote", () => {
    expect(submitReleaseSchema.safeParse({}).success).toBe(false);
    expect(submitReleaseSchema.safeParse({ changeNote: "c" }).success).toBe(
      true,
    );
  });
});

describe("feedback schemas", () => {
  it("createFeedbackSchema validates rating enum", () => {
    expect(
      createFeedbackSchema.safeParse({
        agentId: "a",
        title: "t",
        content: "c",
        rating: "BOGUS",
      }).success,
    ).toBe(false);
    expect(
      createFeedbackSchema.safeParse({
        agentId: "a",
        title: "t",
        content: "c",
        rating: "POSITIVE",
      }).success,
    ).toBe(true);
  });

  it("updateFeedbackSchema validates status enum", () => {
    expect(updateFeedbackSchema.safeParse({ status: "BOGUS" }).success).toBe(
      false,
    );
    expect(updateFeedbackSchema.safeParse({ status: "RESOLVED" }).success).toBe(
      true,
    );
  });
});
