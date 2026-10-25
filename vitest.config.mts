import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // gating logic is under test here; the product default is off
    env: { GATING_ENABLED: "1" },
  },
});
