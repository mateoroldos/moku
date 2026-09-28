import { Glob, file, spawnSync, write } from "bun";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const adapter = fileURLToPath(new URL("../adapters/database-postgres/", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "moku-migrations-"));
const migrations = join(temporary, "drizzle");
const config = join(temporary, "drizzle.config.ts");

try {
  await cp(join(adapter, "drizzle"), migrations, { recursive: true });
  const before = new Map<string, string>();
  for (const name of new Glob("**/*").scanSync({ cwd: migrations, onlyFiles: true })) {
    before.set(name, await file(join(migrations, name)).text());
  }
  await write(
    config,
    `import config from ${JSON.stringify(join(adapter, "drizzle.config.ts"))};\nexport default { ...config, out: ${JSON.stringify(migrations)} };\n`,
  );
  const generated = spawnSync(
    ["bun", "node_modules/drizzle-kit/bin.cjs", "generate", "--config", config],
    { cwd: adapter, stdin: "ignore", stdout: "inherit", stderr: "inherit", timeout: 60000 },
  );
  if (generated.exitCode !== 0) throw new Error("Migration generation failed");
  const after = [...new Glob("**/*").scanSync({ cwd: migrations, onlyFiles: true })];
  if (after.length !== before.size) throw new Error("Schema changed: run bun run db:generate");
  for (const name of after) {
    if (before.get(name) !== (await file(join(migrations, name)).text())) {
      throw new Error("Migration history changed: run bun run db:generate");
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
