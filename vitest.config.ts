import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["app/**/*.test.{ts,tsx}", "convex/**/*.test.{ts,tsx}"],
  },
});
