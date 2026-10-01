import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  RateLimitError,
  SourceError,
} from "@exosquad/common";

describe("AppError", () => {
  it("should create error with default values", () => {
    const error = new AppError("test error");
    expect(error.message).toBe("test error");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.name).toBe("AppError");
  });

  it("should create error with custom values", () => {
    const error = new AppError("custom", 400, "CUSTOM_CODE", { key: "value" });
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("CUSTOM_CODE");
    expect(error.context).toEqual({ key: "value" });
  });

  it("should serialize to JSON correctly", () => {
    const error = new AppError("test", 400, "TEST_CODE", { foo: "bar" });
    const json = error.toJSON();
    expect(json).toEqual({
      error: {
        code: "TEST_CODE",
        message: "test",
        context: { foo: "bar" },
      },
    });
  });

  it("should omit context when not provided", () => {
    const error = new AppError("test", 400, "TEST_CODE");
    const json = error.toJSON();
    expect(json.error).not.toHaveProperty("context");
  });
});

describe("NotFoundError", () => {
  it("should create with resource and id", () => {
    const error = new NotFoundError("User", "123");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("User not found: 123");
    expect(error).toBeInstanceOf(AppError);
  });

  it("should create with resource only", () => {
    const error = new NotFoundError("Product");
    expect(error.message).toBe("Product not found");
  });
});

describe("UnauthorizedError", () => {
  it("should create with default message", () => {
    const error = new UnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Unauthorized");
  });

  it("should create with custom message", () => {
    const error = new UnauthorizedError("Token expired");
    expect(error.message).toBe("Token expired");
  });
});

describe("ForbiddenError", () => {
  it("should create with default message", () => {
    const error = new ForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });
});

describe("ConflictError", () => {
  it("should create with message", () => {
    const error = new ConflictError("Email already exists");
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Email already exists");
  });
});

describe("ValidationError", () => {
  it("should create with details", () => {
    const details = [{ field: "email", message: "invalid" }];
    const error = new ValidationError("Validation failed", details);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toEqual(details);
  });
});

describe("RateLimitError", () => {
  it("should create with retry-after", () => {
    const error = new RateLimitError(60);
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.context?.retryAfter).toBe(60);
  });
});

describe("SourceError", () => {
  it("should create with source context", () => {
    const error = new SourceError("Connection timeout", "src-123", {
      url: "https://example.com",
    });
    expect(error.statusCode).toBe(502);
    expect(error.code).toBe("SOURCE_ERROR");
    expect(error.context?.sourceId).toBe("src-123");
  });
});

describe("Error inheritance", () => {
  it("all custom errors should be instanceof AppError", () => {
    expect(new NotFoundError("x")).toBeInstanceOf(AppError);
    expect(new UnauthorizedError()).toBeInstanceOf(AppError);
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
    expect(new ConflictError("x")).toBeInstanceOf(AppError);
    expect(new ValidationError("x")).toBeInstanceOf(AppError);
    expect(new RateLimitError()).toBeInstanceOf(AppError);
    expect(new SourceError("x")).toBeInstanceOf(AppError);
  });

  it("all custom errors should be instanceof Error", () => {
    expect(new NotFoundError("x")).toBeInstanceOf(Error);
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
  });
});
