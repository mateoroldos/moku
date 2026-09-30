import { file, spawnSync, write } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const schemaPath = join(root, "adapters/database-postgres/src/auth/schema.ts");
const temporary = await mkdtemp(join(tmpdir(), "moku-auth-schema-"));
const run = (command: ReadonlyArray<string>) => {
  const result = spawnSync([...command], {
    cwd: root,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    timeout: 60000,
  });
  if (result.exitCode !== 0) throw new Error(`${command[0]} failed`);
};

try {
  const generatedPath = join(temporary, "schema.ts");
  run([
    join(root, "node_modules/.bin/auth"),
    "generate",
    "--config",
    "apps/web/auth.config.ts",
    "--output",
    generatedPath,
    "--yes",
  ]);
  await write(
    generatedPath,
    `/** @effect-diagnostics globalDate:skip-file */\n${await file(generatedPath).text()}`,
  );
  run([join(root, "node_modules/.bin/oxfmt"), generatedPath]);
  const generated = await file(generatedPath).text();
  if (process.argv.includes("--write")) {
    await write(schemaPath, generated);
  } else if (generated !== (await file(schemaPath).text())) {
    throw new Error(
      "Auth schema drift: run bun run auth:schema:generate, then bun run db:generate",
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
