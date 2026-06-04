/**
 * Frontend integration test for the GitHub Pages build.
 *
 * Builds the production bundle with ``VITE_STATIC_MODE=1`` and a
 * fake ``GITHUB_REPOSITORY`` env var, then serves the resulting
 * ``dist/`` at ``http://127.0.0.1/<repo>/`` (the same shape as
 * https://<user>.github.io/<repo>/).
 *
 * Run with ``npx vitest run`` (not yet wired to package.json).
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Only pick up vitest-style *.test.ts files. The legacy
    // tests/localDates.test.ts uses Node's built-in runner and is
    // excluded so vitest doesn't choke on it.
    include: ["tests/**/*.test.ts", "!tests/localDates.test.ts"],
    testTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});

