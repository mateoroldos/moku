import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/lib/server/*.integration.ts"],
    testTimeout: 15000,
    env: {
      ORIGIN: "http://localhost:3000",
      BETTER_AUTH_SECRET: "moku-integration-test-secret-32-characters",
    },
  },
});
