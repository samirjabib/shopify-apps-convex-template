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
    expect(resolveLocale("zh-cn")).toBe("zh-CN");
    expect(resolveLocale("PT-br")).toBe("pt-BR");
  });

  it("aliases pt → pt-BR, zh → zh-CN", () => {
    expect(resolveLocale("pt")).toBe("pt-BR");
    expect(resolveLocale("zh")).toBe("zh-CN");
  });

  it("matches by language prefix", () => {
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("de-AT")).toBe("de");
    expect(resolveLocale("fr-CA")).toBe("fr");
  });

  it("falls back to en for unsupported (e.g. dropped locales)", () => {
    expect(resolveLocale("xx")).toBe("en");
    expect(resolveLocale("klingon")).toBe("en");
    // Languages we removed from the principal set fall back via prefix or to en
    expect(resolveLocale("ko")).toBe("en");
    expect(resolveLocale("nl")).toBe("en");
  });
});
