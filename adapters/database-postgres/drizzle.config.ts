import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/human-task/schema.ts",
  out: "./drizzle",
});
