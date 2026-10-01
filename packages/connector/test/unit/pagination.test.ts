import { describe, it, expect } from "vitest";
import {
  advancePagination,
  applyPaginationParams,
  parseLinkHeader,
  type PaginationConfig,
  type PaginationState,
} from "../../src/pagination";

describe("advancePagination — page", () => {
  const config: PaginationConfig = { type: "page", paramName: "page", pageSizeParam: "pageSize", pageSize: 10, startPage: 1 };

  it("advances page when response has full page of records", () => {
    const state: PaginationState = { page: 1, hasMore: true };
    const result = advancePagination(config, {
      baseUrl: "https://api.example.com/items",
      queryParams: {},
      state,
      response: { status: 200, headers: {}, body: Array(10).fill({}) },
    });
    expect(result.page).toBe(2);
    expect(result.hasMore).toBe(true);
  });

  it("stops pagination when response has fewer records than pageSize", () => {
    const state: PaginationState = { page: 3, hasMore: true };
    const result = advancePagination(config, {
      baseUrl: "https://api.example.com/items",
      queryParams: {},
      state,
      response: { status: 200, headers: {}, body: [{ id: 1 }] },
    });
    expect(result.page).toBe(4);
    expect(result.hasMore).toBe(false);
  });
});

describe("advancePagination — offset", () => {
  const config: PaginationConfig = { type: "offset", offsetParam: "offset", limitParam: "limit", limit: 20 };

  it("advances offset by number of records returned", () => {
    const state: PaginationState = { offset: 0, hasMore: true };
    const result = advancePagination(config, {
      baseUrl: "https://api.example.com/items",
      queryParams: {},
      state,
      response: { status: 200, headers: {}, body: Array(15).fill({}) },
    });
    expect(result.offset).toBe(15);
    expect(result.hasMore).toBe(false); // 15 < 20
  });
});

describe("advancePagination — cursor", () => {
  const config: PaginationConfig = { type: "cursor", cursorParam: "cursor", limitParam: "limit", limit: 10 };

  it("extracts next_cursor from response body", () => {
    const state: PaginationState = { hasMore: true };
    const result = advancePagination(config, {
      baseUrl: "https://api.example.com/items",
      queryParams: {},
      state,
      response: { status: 200, headers: {}, body: { data: [], next_cursor: "abc123" } },
    });
    expect(result.cursor).toBe("abc123");
    expect(result.hasMore).toBe(true);
  });

  it("stops when no cursor in response", () => {
    const state: PaginationState = { hasMore: true };
    const result = advancePagination(config, {
      baseUrl: "https://api.example.com/items",
      queryParams: {},
      state,
      response: { status: 200, headers: {}, body: { data: [] } },
    });
    expect(result.hasMore).toBe(false);
  });
});

describe("advancePagination — link", () => {
  const config: PaginationConfig = { type: "link", rel: "next", headerName: "link" };

  it("extracts next URL from Link header", () => {
    const state: PaginationState = { hasMore: true };
    const result = advancePagination(config, {
      baseUrl: "https://api.example.com/items",
      queryParams: {},
      state,
      response: {
        status: 200,
        headers: { "link": '<https://api.example.com/items?page=2>; rel="next"' },
        body: [],
      },
    });
    expect(result.nextUrl).toBe("https://api.example.com/items?page=2");
    expect(result.hasMore).toBe(true);
  });

  it("stops when no next link", () => {
    const state: PaginationState = { hasMore: true };
    const result = advancePagination(config, {
      baseUrl: "https://api.example.com/items",
      queryParams: {},
      state,
      response: { status: 200, headers: {}, body: [] },
    });
    expect(result.hasMore).toBe(false);
  });
});

describe("applyPaginationParams", () => {
  it("applies page params", () => {
    const config: PaginationConfig = { type: "page", paramName: "page", pageSizeParam: "per_page", pageSize: 25, startPage: 1 };
    const params: Record<string, string> = {};
    applyPaginationParams(config, { page: 3, hasMore: true }, params);
    expect(params["page"]).toBe("3");
    expect(params["per_page"]).toBe("25");
  });

  it("applies offset params", () => {
    const config: PaginationConfig = { type: "offset", offsetParam: "skip", limitParam: "take", limit: 50 };
    const params: Record<string, string> = {};
    applyPaginationParams(config, { offset: 100, hasMore: true }, params);
    expect(params["skip"]).toBe("100");
    expect(params["take"]).toBe("50");
  });

  it("applies cursor params", () => {
    const config: PaginationConfig = { type: "cursor", cursorParam: "after", limitParam: "limit", limit: 10 };
    const params: Record<string, string> = {};
    applyPaginationParams(config, { cursor: "xyz", hasMore: true }, params);
    expect(params["after"]).toBe("xyz");
    expect(params["limit"]).toBe("10");
  });
});

describe("parseLinkHeader", () => {
  it("parses RFC 5988 Link header", () => {
    const header = '<https://api.example.com/items?page=2>; rel="next", <https://api.example.com/items?page=1>; rel="prev"';
    expect(parseLinkHeader(header, "next")).toBe("https://api.example.com/items?page=2");
    expect(parseLinkHeader(header, "prev")).toBe("https://api.example.com/items?page=1");
  });

  it("returns null for missing relation", () => {
    const header = '<https://api.example.com/items?page=2>; rel="next"';
    expect(parseLinkHeader(header, "prev")).toBeNull();
  });
});
