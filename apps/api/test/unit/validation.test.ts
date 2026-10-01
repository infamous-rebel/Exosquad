import { describe, it, expect } from "vitest";
import { paginationSchema, sortSchema, idParamSchema } from "@exosquad/common";

describe("paginationSchema", () => {
  it("should parse valid pagination", () => {
    const result = paginationSchema.parse({ page: "2", limit: "10" });
    expect(result).toEqual({ page: 2, limit: 10 });
  });

  it("should use defaults", () => {
    const result = paginationSchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it("should reject page < 1", () => {
    expect(() => paginationSchema.parse({ page: "0" })).toThrow();
  });

  it("should reject limit > 100", () => {
    expect(() => paginationSchema.parse({ limit: "101" })).toThrow();
  });

  it("should reject non-numeric values", () => {
    expect(() => paginationSchema.parse({ page: "abc" })).toThrow();
  });
});

describe("sortSchema", () => {
  it("should parse valid sort", () => {
    const result = sortSchema.parse({ sortBy: "createdAt", sortOrder: "asc" });
    expect(result).toEqual({ sortBy: "createdAt", sortOrder: "asc" });
  });

  it("should default sortOrder to desc", () => {
    const result = sortSchema.parse({});
    expect(result.sortOrder).toBe("desc");
  });

  it("should reject invalid sortOrder", () => {
    expect(() => sortSchema.parse({ sortOrder: "invalid" })).toThrow();
  });
});

describe("idParamSchema", () => {
  it("should accept valid id", () => {
    const result = idParamSchema.parse({ id: "abc123" });
    expect(result.id).toBe("abc123");
  });

  it("should reject empty id", () => {
    expect(() => idParamSchema.parse({ id: "" })).toThrow();
  });
});
