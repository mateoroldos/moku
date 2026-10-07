import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/lib/server/*.integration.ts"],
    testTimeout: 15000,
    env: {
      NODE_ENV: "production",
      TEST: "false",
      EMAIL_DELIVERY: "console",
      ORIGIN: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-only-secret-for-authentication-123456",
    },
  },
});
