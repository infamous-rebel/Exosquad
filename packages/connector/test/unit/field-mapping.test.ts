import { describe, it, expect } from "vitest";
import {
  extractPath,
  applyFieldMapping,
  extractDataArray,
  mapResponseRecords,
  type FieldMapping,
} from "../../src/field-mapping";

describe("extractPath", () => {
  it("extracts simple nested path", () => {
    expect(extractPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns undefined for missing path", () => {
    expect(extractPath({ a: 1 }, "b.c")).toBeUndefined();
  });

  it("handles array indexing", () => {
    expect(extractPath({ items: [10, 20, 30] }, "items[1]")).toBe(20);
  });

  it("returns undefined for invalid array access", () => {
    expect(extractPath({ items: "not-array" }, "items[0]")).toBeUndefined();
  });
});

describe("applyFieldMapping", () => {
  const mapping: FieldMapping = {
    fields: {
      name: "title",
      price: { path: "cost.amount", transform: "number" },
      currency: { path: "cost.currency", default: "USD" },
      active: { path: "status", transform: "boolean" },
    },
  };

  it("maps fields using simple paths", () => {
    const result = applyFieldMapping({ title: "Widget" }, mapping);
    expect(result.name).toBe("Widget");
  });

  it("maps nested fields with type coercion", () => {
    const result = applyFieldMapping({ cost: { amount: "19.99", currency: "BDT" } }, mapping);
    expect(result.price).toBe(19.99);
    expect(result.currency).toBe("BDT");
  });

  it("applies defaults for missing fields", () => {
    const result = applyFieldMapping({ cost: { amount: 10 } }, mapping);
    expect(result.currency).toBe("USD");
  });

  it("transforms string to boolean", () => {
    const result = applyFieldMapping({ status: "true" }, mapping);
    expect(result.active).toBe(true);
  });
});

describe("extractDataArray", () => {
  it("extracts from dataPath", () => {
    const mapping: FieldMapping = { fields: {}, dataPath: "results" };
    const data = extractDataArray({ results: [{ id: 1 }, { id: 2 }] }, mapping);
    expect(data).toHaveLength(2);
  });

  it("returns array response directly when no dataPath", () => {
    const mapping: FieldMapping = { fields: {} };
    const data = extractDataArray([{ id: 1 }], mapping);
    expect(data).toHaveLength(1);
  });

  it("wraps single object when no dataPath", () => {
    const mapping: FieldMapping = { fields: {} };
    const data = extractDataArray({ id: 1 }, mapping);
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({ id: 1 });
  });
});

describe("mapResponseRecords", () => {
  it("maps all records in a response", () => {
    const mapping: FieldMapping = {
      fields: { label: "name" },
      dataPath: "items",
    };
    const response = { items: [{ name: "A" }, { name: "B" }] };
    const result = mapResponseRecords(response, mapping);
    expect(result).toEqual([{ label: "A" }, { label: "B" }]);
  });
});
