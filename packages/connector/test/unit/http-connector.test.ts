import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { HttpConnector } from "../../src/http-connector";
import { ConnectorError, TimeoutError, MalformedResponseError, CircuitOpenError } from "../../src/errors";
import { sanitizeRequestHeaders } from "../../src/types";
import type { SourceConfig } from "../../src/types";

// ─── Test HTTP Server ──────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;
let requestCount: number;
let lastHeaders: http.IncomingHttpHeaders;

function createTestServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<string> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      requestCount++;
      lastHeaders = req.headers;
      handler(req, res);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve(baseUrl);
      }
    });
  });
}

beforeAll(async () => {
  // Default server that returns JSON
  await createTestServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: 1, name: "Item 1" }, { id: 2, name: "Item 2" }] }));
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requestCount = 0;
  lastHeaders = {};
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("HttpConnector — successful fetch", () => {
  it("fetches JSON from a real HTTP server", async () => {
    const connector = new HttpConnector({ skipSsrfValidation: true });
    const config: SourceConfig = { url: `${baseUrl}/api/items` };
    const result = await connector.fetch(config, "test-source-1");

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: [{ id: 1, name: "Item 1" }, { id: 2, name: "Item 2" }] });
    expect(result.contentHash).toHaveLength(64);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.recordCount).toBe(2);
    expect(result.requestMethod).toBe("GET");
    expect(result.retrievedAt).toBeInstanceOf(Date);
  });

  it("preserves raw body for provenance", async () => {
    const connector = new HttpConnector({ skipSsrfValidation: true });
    const config: SourceConfig = { url: `${baseUrl}/api/items` };
    const result = await connector.fetch(config, "test-source-2");

    expect(result.rawBody).toBeTruthy();
    const parsed = JSON.parse(result.rawBody);
    expect(parsed.data).toHaveLength(2);
  });

  it("sanitizes auth headers from stored metadata", async () => {
    const connector = new HttpConnector({ skipSsrfValidation: true });
    const config: SourceConfig = {
      url: `${baseUrl}/api/items`,
      auth: { type: "bearer", token: "secret-jwt-token" },
    };
    const result = await connector.fetch(config, "test-source-3");

    // Authorization header should be stripped from stored request headers
    expect(result.requestHeaders["Authorization"]).toBeUndefined();
    expect(result.requestHeaders["authorization"]).toBeUndefined();
  });
});

describe("HttpConnector — authentication", () => {
  it("sends bearer token in request", async () => {
    const connector = new HttpConnector({ skipSsrfValidation: true });
    const config: SourceConfig = {
      url: `${baseUrl}/api/protected`,
      auth: { type: "bearer", token: "my-jwt-token" },
    };
    await connector.fetch(config, "test-auth-1");

    expect(lastHeaders["authorization"]).toBe("Bearer my-jwt-token");
  });

  it("sends api key in custom header", async () => {
    const connector = new HttpConnector({ skipSsrfValidation: true });
    const config: SourceConfig = {
      url: `${baseUrl}/api/data`,
      auth: { type: "api_key", key: "test-key-123", headerName: "X-API-Key", prefix: "", location: "header", queryParamName: "api_key" },
    };
    await connector.fetch(config, "test-auth-2");

    expect(lastHeaders["x-api-key"]).toBe("test-key-123");
  });
});

describe("HttpConnector — timeout", () => {
  it("throws TimeoutError when request exceeds timeout", async () => {
    // Create a slow server
    const slowServer = http.createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      }, 2000);
    });
    const slowUrl = await new Promise<string>((resolve) => {
      slowServer.listen(0, "127.0.0.1", () => {
        const addr = slowServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = { url: `${slowUrl}/slow`, timeoutMs: 100 };

      await expect(connector.fetch(config, "test-timeout")).rejects.toThrow(TimeoutError);
    } finally {
      await new Promise<void>((resolve) => slowServer.close(() => resolve()));
    }
  });
});

describe("HttpConnector — malformed response", () => {
  it("throws MalformedResponseError for invalid JSON with JSON content-type", async () => {
    const badServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("this is not json {{{");
    });
    const badUrl = await new Promise<string>((resolve) => {
      badServer.listen(0, "127.0.0.1", () => {
        const addr = badServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = { url: `${badUrl}/bad` };

      await expect(connector.fetch(config, "test-malformed")).rejects.toThrow(MalformedResponseError);
    } finally {
      await new Promise<void>((resolve) => badServer.close(() => resolve()));
    }
  });
});

describe("HttpConnector — HTTP error handling", () => {
  it("throws non-retryable error on 401", async () => {
    const authServer = http.createServer((_req, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end('{"error":"unauthorized"}');
    });
    const authUrl = await new Promise<string>((resolve) => {
      authServer.listen(0, "127.0.0.1", () => {
        const addr = authServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = { url: `${authUrl}/protected` };

      try {
        await connector.fetch(config, "test-401");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectorError);
        expect((err as ConnectorError).retryable).toBe(false);
      }
    } finally {
      await new Promise<void>((resolve) => authServer.close(() => resolve()));
    }
  });

  it("throws retryable error on 500", async () => {
    const errServer = http.createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end('{"error":"internal"}');
    });
    const errUrl = await new Promise<string>((resolve) => {
      errServer.listen(0, "127.0.0.1", () => {
        const addr = errServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = { url: `${errUrl}/fail` };

      try {
        await connector.fetch(config, "test-500");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectorError);
        expect((err as ConnectorError).retryable).toBe(true);
      }
    } finally {
      await new Promise<void>((resolve) => errServer.close(() => resolve()));
    }
  });
});

describe("HttpConnector — retry", () => {
  it("retries on 503 and succeeds on subsequent attempt", async () => {
    let calls = 0;
    const retryServer = http.createServer((_req, res) => {
      calls++;
      if (calls < 3) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end('{"error":"unavailable"}');
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"data":"recovered"}');
      }
    });
    const retryUrl = await new Promise<string>((resolve) => {
      retryServer.listen(0, "127.0.0.1", () => {
        const addr = retryServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = {
        url: `${retryUrl}/flaky`,
        retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 50, jitterFactor: 0, multiplier: 2, retryableStatusCodes: [503] },
      };
      const result = await connector.fetch(config, "test-retry");

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ data: "recovered" });
      expect(calls).toBe(3);
    } finally {
      await new Promise<void>((resolve) => retryServer.close(() => resolve()));
    }
  });
});

describe("HttpConnector — pagination", () => {
  it("fetches all pages with page-based pagination", async () => {
    let pageCalls = 0;
    const pageServer = http.createServer((req, res) => {
      pageCalls++;
      const url = new URL(req.url ?? "/", `http://127.0.0.1`);
      const page = parseInt(url.searchParams.get("page") ?? "1", 10);

      res.writeHead(200, { "Content-Type": "application/json" });
      if (page <= 2) {
        res.end(JSON.stringify({ data: [{ id: page * 10 + 1 }, { id: page * 10 + 2 }] }));
      } else {
        res.end(JSON.stringify({ data: [{ id: 31 }] })); // last page with 1 record
      }
    });
    const pageUrl = await new Promise<string>((resolve) => {
      pageServer.listen(0, "127.0.0.1", () => {
        const addr = pageServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = {
        url: `${pageUrl}/items`,
        pagination: { type: "page", paramName: "page", pageSizeParam: "pageSize", pageSize: 2, startPage: 1 },
      };
      const result = await connector.fetchAll(config, "test-pagination");

      expect(result.results.length).toBe(3); // 3 pages
      expect(result.totalRecords).toBe(5); // 2 + 2 + 1
      expect(result.checkpoint.totalRecordsProcessed).toBe(5);
    } finally {
      await new Promise<void>((resolve) => pageServer.close(() => resolve()));
    }
  });
});

describe("HttpConnector — content hashing / idempotency", () => {
  it("produces same hash for same content", async () => {
    const connector = new HttpConnector({ skipSsrfValidation: true });
    const config: SourceConfig = { url: `${baseUrl}/api/items` };

    const result1 = await connector.fetch(config, "test-hash-1");
    const result2 = await connector.fetch(config, "test-hash-2");

    expect(result1.contentHash).toBe(result2.contentHash);
  });
});

describe("sanitizeRequestHeaders", () => {
  it("removes authorization header", () => {
    const sanitized = sanitizeRequestHeaders({
      "Authorization": "Bearer secret",
      "Accept": "application/json",
    });
    expect(sanitized["Authorization"]).toBeUndefined();
    expect(sanitized["Accept"]).toBe("application/json");
  });

  it("removes x-api-key header", () => {
    const sanitized = sanitizeRequestHeaders({
      "X-API-Key": "secret-key",
      "Content-Type": "application/json",
    });
    expect(sanitized["X-API-Key"]).toBeUndefined();
    expect(sanitized["Content-Type"]).toBe("application/json");
  });

  it("removes cookie header", () => {
    const sanitized = sanitizeRequestHeaders({
      "Cookie": "session=abc123",
      "User-Agent": "EXOSQUAD",
    });
    expect(sanitized["Cookie"]).toBeUndefined();
    expect(sanitized["User-Agent"]).toBe("EXOSQUAD");
  });
});

describe("HttpConnector — SSRF protection", () => {
  it("blocks requests to localhost by default", async () => {
    const connector = new HttpConnector(); // SSRF ON by default
    const config: SourceConfig = { url: "http://localhost:3000/api" };
    await expect(connector.fetch(config, "test-ssrf")).rejects.toThrow(/Blocked hostname/);
  });

  it("blocks requests to private IPs by default", async () => {
    const connector = new HttpConnector();
    const config: SourceConfig = { url: "http://10.0.0.1/api" };
    await expect(connector.fetch(config, "test-ssrf")).rejects.toThrow(/Blocked private IP/);
  });

  it("blocks requests to 127.0.0.1 by default", async () => {
    const connector = new HttpConnector();
    const config: SourceConfig = { url: "http://127.0.0.1:9999/api" };
    await expect(connector.fetch(config, "test-ssrf")).rejects.toThrow(/Blocked hostname/);
  });

  it("allows localhost when skipSsrfValidation is true", async () => {
    const connector = new HttpConnector({ skipSsrfValidation: true });
    const config: SourceConfig = { url: `${baseUrl}/api/items` };
    const result = await connector.fetch(config, "test-ssrf-bypass");
    expect(result.status).toBe(200);
  });
});

describe("HttpConnector — repeated cursor detection", () => {
  it("stops pagination when cursor repeats (infinite loop prevention)", async () => {
    let cursorCalls = 0;
    const cursorServer = http.createServer((req, res) => {
      cursorCalls++;
      const url = new URL(req.url ?? "/", `http://127.0.0.1`);
      const cursor = url.searchParams.get("cursor");

      res.writeHead(200, { "Content-Type": "application/json" });
      // Always return the same cursor — simulates a broken API
      res.end(JSON.stringify({ data: [{ id: cursorCalls }], next_cursor: "stuck-cursor" }));
    });
    const cursorUrl = await new Promise<string>((resolve) => {
      cursorServer.listen(0, "127.0.0.1", () => {
        const addr = cursorServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = {
        url: `${cursorUrl}/items`,
        pagination: { type: "cursor", cursorParam: "cursor", limitParam: "limit", limit: 1 },
      };
      const result = await connector.fetchAll(config, "test-repeated-cursor");

      // Should stop after 2 pages: first page gets cursor, second page sees repeated cursor
      expect(result.results.length).toBe(2);
      expect(cursorCalls).toBe(2);
    } finally {
      await new Promise<void>((resolve) => cursorServer.close(() => resolve()));
    }
  });
});

describe("HttpConnector — onPageComplete callback", () => {
  it("invokes callback after each page", async () => {
    let pageCalls = 0;
    const pageServer = http.createServer((req, res) => {
      pageCalls++;
      const url = new URL(req.url ?? "/", `http://127.0.0.1`);
      const page = parseInt(url.searchParams.get("page") ?? "1", 10);

      res.writeHead(200, { "Content-Type": "application/json" });
      if (page <= 2) {
        res.end(JSON.stringify({ data: [{ id: page * 10 + 1 }, { id: page * 10 + 2 }] }));
      } else {
        res.end(JSON.stringify({ data: [] }));
      }
    });
    const pageUrl = await new Promise<string>((resolve) => {
      pageServer.listen(0, "127.0.0.1", () => {
        const addr = pageServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = {
        url: `${pageUrl}/items`,
        pagination: { type: "page", paramName: "page", pageSizeParam: "pageSize", pageSize: 2, startPage: 1 },
      };

      const callbackPages: number[] = [];
      const callbackTotals: number[] = [];

      const result = await connector.fetchAll(
        config,
        "test-callback",
        undefined,
        undefined,
        async (_page, pageIndex, runningTotal, _checkpoint) => {
          callbackPages.push(pageIndex);
          callbackTotals.push(runningTotal);
        }
      );

      // 3 pages fetched (2 full + 1 empty)
      expect(result.results.length).toBe(3);
      // Callback should have been called 3 times
      expect(callbackPages).toEqual([1, 2, 3]);
      expect(callbackTotals).toEqual([2, 4, 4]);
    } finally {
      await new Promise<void>((resolve) => pageServer.close(() => resolve()));
    }
  });
});

describe("HttpConnector — empty response handling", () => {
  it("handles empty array response gracefully", async () => {
    const emptyServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    });
    const emptyUrl = await new Promise<string>((resolve) => {
      emptyServer.listen(0, "127.0.0.1", () => {
        const addr = emptyServer.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const connector = new HttpConnector({ skipSsrfValidation: true });
      const config: SourceConfig = { url: `${emptyUrl}/items` };
      const result = await connector.fetch(config, "test-empty");

      expect(result.status).toBe(200);
      expect(result.recordCount).toBe(0);
    } finally {
      await new Promise<void>((resolve) => emptyServer.close(() => resolve()));
    }
  });
});
