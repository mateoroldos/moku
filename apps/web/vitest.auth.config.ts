import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/lib/server/*.http.ts"], testTimeout: 30000, hookTimeout: 30000 },
});
