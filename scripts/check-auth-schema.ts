import { file, spawnSync } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const adapter = join(root, "adapters/database-postgres");
const web = join(root, "apps/web");
const temporary = await mkdtemp(join(tmpdir(), "moku-auth-schema-"));
const generated = join(temporary, "schema.ts");

try {
  const generation = spawnSync(
    [
      "bun",
      "run",
      "auth",
      "generate",
      "--config",
      "./auth.config.ts",
      "--output",
      generated,
      "--yes",
    ],
    { cwd: web, stdin: "ignore", stdout: "inherit", stderr: "inherit", timeout: 60000 },
  );
  if (generation.exitCode !== 0) throw new Error("Better Auth schema generation failed");

  const formatting = spawnSync(["bun", "run", "oxfmt", generated], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    timeout: 60000,
  });
  if (formatting.exitCode !== 0) throw new Error("Auth schema formatting failed");

  if ((await file(generated).text()) !== (await file(join(adapter, "src/auth/schema.ts")).text())) {
    throw new Error("Auth schema drift: run bun run --cwd apps/web auth:generate");
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
