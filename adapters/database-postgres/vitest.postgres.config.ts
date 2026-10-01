import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/test/*.integration.ts"], testTimeout: 15000, fileParallelism: false },
});
