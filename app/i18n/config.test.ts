import { describe, expect, it } from "vitest";
import { resolveLocale, SUPPORTED_LOCALES } from "./config";

describe("resolveLocale", () => {
  it("returns en for null/undefined/empty", () => {
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });

  it("matches exact supported locale", () => {
    for (const l of SUPPORTED_LOCALES) {
      expect(resolveLocale(l)).toBe(l);
    }
  });

  it("matches case-insensitively", () => {
    expect(resolveLocale("ES")).toBe("es");
    expect(resolveLocale("PT-br")).toBe("pt-BR");
    expect(resolveLocale("FR")).toBe("fr");
  });

  it("aliases pt → pt-BR", () => {
    expect(resolveLocale("pt")).toBe("pt-BR");
    expect(resolveLocale("pt-PT")).toBe("pt-BR");
  });

  it("matches by language prefix", () => {
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("fr-CA")).toBe("fr");
    expect(resolveLocale("es-MX")).toBe("es");
  });

  it("falls back to en for unsupported", () => {
    expect(resolveLocale("xx")).toBe("en");
    expect(resolveLocale("klingon")).toBe("en");
    expect(resolveLocale("de")).toBe("en");
    expect(resolveLocale("ja")).toBe("en");
    expect(resolveLocale("zh-CN")).toBe("en");
  });
});
