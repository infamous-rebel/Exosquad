import { describe, it, expect } from "vitest";
import { applyAuth, parseAuthConfig, type RequestParts } from "../../src/auth";
import { AuthenticationError } from "../../src/errors";

function makeRequest(): RequestParts {
  return {
    url: "https://api.example.com/data",
    headers: { "Accept": "application/json" },
    queryParams: {},
  };
}

describe("applyAuth", () => {
  it("does nothing for 'none' auth", () => {
    const req = makeRequest();
    applyAuth({ type: "none" }, req);
    expect(req.headers["Authorization"]).toBeUndefined();
    expect(Object.keys(req.queryParams)).toHaveLength(0);
  });

  it("applies api_key in header", () => {
    const req = makeRequest();
    applyAuth({ type: "api_key", key: "my-key", headerName: "X-API-Key", prefix: "", location: "header", queryParamName: "api_key" }, req);
    expect(req.headers["X-API-Key"]).toBe("my-key");
  });

  it("applies api_key in query parameter", () => {
    const req = makeRequest();
    applyAuth({ type: "api_key", key: "my-key", headerName: "X-API-Key", prefix: "", location: "query", queryParamName: "apikey" }, req);
    expect(req.queryParams["apikey"]).toBe("my-key");
    expect(req.headers["X-API-Key"]).toBeUndefined();
  });

  it("applies api_key with prefix in header", () => {
    const req = makeRequest();
    applyAuth({ type: "api_key", key: "my-key", headerName: "Authorization", prefix: "Token ", location: "header", queryParamName: "api_key" }, req);
    expect(req.headers["Authorization"]).toBe("Token my-key");
  });

  it("applies bearer token", () => {
    const req = makeRequest();
    applyAuth({ type: "bearer", token: "jwt-token-123" }, req);
    expect(req.headers["Authorization"]).toBe("Bearer jwt-token-123");
  });

  it("applies basic auth with base64 encoding", () => {
    const req = makeRequest();
    applyAuth({ type: "basic", username: "user", password: "pass" }, req);
    const expected = "Basic " + Buffer.from("user:pass").toString("base64");
    expect(req.headers["Authorization"]).toBe(expected);
  });

  it("applies oauth2 token", () => {
    const req = makeRequest();
    applyAuth({ type: "oauth2", accessToken: "oauth-token", tokenType: "Bearer" }, req);
    expect(req.headers["Authorization"]).toBe("Bearer oauth-token");
  });
});

describe("parseAuthConfig", () => {
  it("parses valid bearer config", () => {
    const config = parseAuthConfig({ type: "bearer", token: "abc123" });
    expect(config.type).toBe("bearer");
  });

  it("throws AuthenticationError for invalid config", () => {
    expect(() => parseAuthConfig({ type: "invalid" })).toThrow(AuthenticationError);
  });

  it("throws for missing required fields", () => {
    expect(() => parseAuthConfig({ type: "bearer" })).toThrow();
  });
});
