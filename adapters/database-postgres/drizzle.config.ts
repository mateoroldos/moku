import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/human-task/schema.ts",
    "./src/auth/schema.ts",
    "./src/auth/mail-admission-schema.ts",
  ],
  out: "./drizzle",
});
