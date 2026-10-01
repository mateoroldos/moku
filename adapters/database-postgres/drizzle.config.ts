import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/human-task/schema.ts", "./src/auth/schema.ts"],
  out: "./drizzle",
});
