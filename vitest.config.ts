import { defineConfig } from "vitest/config";

// Unit tests cover pure TypeScript (parsers, reducers, stores). They run in
// Node without the Vite app plugins; GUI behaviour still needs manual checks.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
