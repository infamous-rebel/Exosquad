import { describe, it, expect } from "vitest";
import {
  normalizeText,
  normalizePunctuation,
  collapseWhitespace,
  normalizeBrandName,
  normalizeProductName,
  createSearchKey,
  isTextEquivalent,
} from "../../src/text.js";

describe("normalizeText", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeText("")).toBe("");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });

  it("collapses multiple spaces to one", () => {
    expect(normalizeText("hello   world")).toBe("hello world");
  });

  it("collapses tabs and newlines", () => {
    expect(normalizeText("hello\t\tworld\n\nfoo")).toBe("hello world foo");
  });

  it("normalizes Unicode NFC", () => {
    // é as e + combining accent (NFD) → é as single char (NFC)
    const nfd = "cafe\u0301"; // e + combining accent
    const result = normalizeText(nfd);
    expect(result).toBe("café");
    expect(result.normalize("NFC")).toBe(result);
  });

  it("optionally lowercases", () => {
    expect(normalizeText("Hello WORLD", { lowercase: true })).toBe("hello world");
  });

  it("preserves casing by default", () => {
    expect(normalizeText("Hello World")).toBe("Hello World");
  });
});

describe("normalizePunctuation", () => {
  it("converts smart single quotes to straight quotes", () => {
    expect(normalizePunctuation("\u2018hello\u2019")).toBe("'hello'");
  });

  it("converts smart double quotes to straight quotes", () => {
    expect(normalizePunctuation("\u201Chello\u201D")).toBe('"hello"');
  });

  it("converts em/en dashes to hyphens", () => {
    expect(normalizePunctuation("hello\u2013world")).toBe("hello-world");
    expect(normalizePunctuation("hello\u2014world")).toBe("hello-world");
  });

  it("converts ellipsis to three dots", () => {
    expect(normalizePunctuation("hello\u2026")).toBe("hello...");
  });

  it("converts non-breaking space to regular space", () => {
    expect(normalizePunctuation("hello\u00A0world")).toBe("hello world");
  });

  it("removes zero-width characters", () => {
    expect(normalizePunctuation("hel\u200Blo")).toBe("hello");
    expect(normalizePunctuation("hel\uFEFFlo")).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(normalizePunctuation("")).toBe("");
  });
});

describe("collapseWhitespace", () => {
  it("collapses multiple spaces", () => {
    expect(collapseWhitespace("a   b")).toBe("a b");
  });

  it("handles mixed whitespace", () => {
    expect(collapseWhitespace("a \t\n b")).toBe("a b");
  });

  it("returns empty string for empty input", () => {
    expect(collapseWhitespace("")).toBe("");
  });
});

describe("normalizeBrandName", () => {
  it("lowercases and normalizes", () => {
    expect(normalizeBrandName("  Cetaphil  ")).toBe("cetaphil");
  });

  it("handles Unicode", () => {
    expect(normalizeBrandName("L\u2019Oréal")).toBe("l'oréal");
  });
});

describe("normalizeProductName", () => {
  it("normalizes whitespace and punctuation", () => {
    expect(normalizeProductName("Gentle   Skin  Cleanser")).toBe("Gentle Skin Cleanser");
  });

  it("preserves casing", () => {
    expect(normalizeProductName("NIVEA Soft")).toBe("NIVEA Soft");
  });
});

describe("createSearchKey", () => {
  it("lowercases and removes punctuation", () => {
    // \w in JS regex doesn't include accented chars, so é is removed
    expect(createSearchKey("L'Oréal")).toBe("loral");
  });

  it("collapses whitespace", () => {
    expect(createSearchKey("  Hello   World  ")).toBe("hello world");
  });

  it("removes special characters", () => {
    expect(createSearchKey("P&G (Procter)")).toBe("pg procter");
  });
});

describe("isTextEquivalent", () => {
  it("detects equivalent strings with different casing", () => {
    expect(isTextEquivalent("Cetaphil", "cetaphil")).toBe(true);
  });

  it("detects equivalent strings with different whitespace", () => {
    expect(isTextEquivalent("Gentle  Skin", "Gentle Skin")).toBe(true);
  });

  it("detects non-equivalent strings", () => {
    expect(isTextEquivalent("Cetaphil", "Nivea")).toBe(false);
  });

  it("returns false for empty inputs", () => {
    expect(isTextEquivalent("", "hello")).toBe(false);
    expect(isTextEquivalent("hello", "")).toBe(false);
  });
});
