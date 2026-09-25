import { Schema } from "effect";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { workspaces } from "../tools/architecture/workspaces.ts";

const repository = fileURLToPath(new URL("../", import.meta.url));
const oxlint = path.join(repository, "node_modules/.bin/oxlint");

function fixture(files: Readonly<Record<string, string>>, check: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "workspaces-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const filename = path.join(root, name);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, content);
    }
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(cwd: string, executable: string, args: ReadonlyArray<string>) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", timeout: 10_000 });
  if (result.error) throw result.error;
  return { output: result.stdout + result.stderr, exitCode: result.status };
}

it("checks allowed dependencies, all dependency sections, and workspace registration", () => {
  const manifests = Object.fromEntries(
    workspaces.map(({ name, directory }) => [
      `${directory}/package.json`,
      JSON.stringify({ name }),
    ]),
  );
  fixture(manifests, (root) => {
    const manifest = path.join(root, "packages/core/package.json");
    const checker = path.join(repository, "scripts/check-workspaces.ts");
    writeFileSync(manifest, '{"name":"@moku/core","dependencies":{"@moku/domain":"workspace:*"}}');
    const valid = run(root, "bun", [checker]);
    expect(valid.exitCode, valid.output).toBe(0);

    const domainManifest = path.join(root, "packages/domain/package.json");
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      writeFileSync(
        domainManifest,
        JSON.stringify({ name: "@moku/domain", [section]: { "@moku/core": "workspace:*" } }),
      );
      const forbidden = run(root, "bun", [checker]);
      expect(forbidden.exitCode).toBe(1);
      expect(forbidden.output).toContain("@moku/domain must not depend on @moku/core");
    }
    writeFileSync(domainManifest, '{"name":"@moku/domain"}');

    for (const [content, diagnostic] of [
      ['{"name":"@moku/new"}', "add @moku/new to tools/architecture/workspaces.ts"],
      ['{"name":"@moku/domain"}', "belongs in packages/domain"],
      ['{"name":42}', "packages/core/package.json: invalid package manifest"],
    ] as const) {
      writeFileSync(manifest, content);
      const result = run(root, "bun", [checker]);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(diagnostic);
    }
    writeFileSync(manifest, '{"name":"@moku/core"}');
    rmSync(domainManifest);
    const missing = run(root, "bun", [checker]);
    expect(missing.exitCode).toBe(1);
    expect(missing.output).toContain(
      "packages/domain/package.json: missing manifest for @moku/domain",
    );
  });
});

it("checks ESM boundaries through Oxlint, including relative and absolute paths", () => {
  const forbidden = {
    "packages/domain/src/static.ts": 'import "@moku/core/human-task-directory";',
    "packages/domain/src/relative.ts":
      'import "../../core/src/human-task/human-task-directory.ts";',
    "packages/domain/src/reexport.ts": 'export * from "@moku/core";',
    "packages/domain/src/named.ts": 'export { value } from "@moku/core";',
    "packages/domain/src/type.ts": 'import type { Value } from "@moku/core";',
    "packages/domain/src/import-type.ts": 'type Value = import("@moku/core").Value;',
    "packages/domain/src/dynamic.ts": 'import("@moku/core");',
    "packages/domain/src/template.ts": "import(`@moku/core`);",
    "packages/core/src/unknown-relative.ts": 'import "../../unknown/src/store.ts";',
    "packages/domain/src/unknown.ts": 'import "@moku/unknown";',
    "packages/domain/src/prefix.ts": 'import "@moku/domain-extra";',
  };
  fixture(
    {
      ...forbidden,
      "packages/core/src/allowed.ts":
        'import "@moku/domain/human-task"; import "./local.ts"; import "effect"; import "@other/core";',
      "packages/core/src/allowed-relative.ts":
        'import "../../domain/src/human-task/human-task.ts";',
      "packages/domain/src/self.ts": 'export * from "@moku/domain/human-task";',
      "packages/domain/src/computed.ts": 'const name = "@moku/core"; import(name);',
      "tools/oxlint/workspace-boundaries.ts": readFileSync(
        path.join(repository, "tools/oxlint/workspace-boundaries.ts"),
        "utf8",
      ),
      "tools/architecture/workspaces.ts": readFileSync(
        path.join(repository, "tools/architecture/workspaces.ts"),
        "utf8",
      ),
      ".oxlintrc.json": JSON.stringify({
        categories: { correctness: "off" },
        jsPlugins: ["./tools/oxlint/workspace-boundaries.ts"],
        rules: { "workspace-boundaries/no-cross-workspace-imports": "error" },
      }),
    },
    (root) => {
      symlinkSync(path.join(repository, "node_modules"), path.join(root, "node_modules"));
      writeFileSync(
        path.join(root, "packages/domain/src/absolute.ts"),
        `import ${JSON.stringify(path.join(root, "packages/core/src/human-task/human-task-directory.ts"))};`,
      );
      const result = run(root, oxlint, ["-c", ".oxlintrc.json", "--format", "json", "packages"]);
      expect(result.exitCode).toBe(1);
      const report = Schema.decodeSync(
        Schema.fromJsonString(
          Schema.Struct({
            diagnostics: Schema.Array(
              Schema.Struct({ filename: Schema.String, code: Schema.String }),
            ),
          }),
        ),
      )(result.output);
      expect(
        report.diagnostics.every(
          (item) => item.code === "workspace-boundaries(no-cross-workspace-imports)",
        ),
      ).toBe(true);
      expect(report.diagnostics.map((item) => item.filename).sort()).toEqual(
        [...Object.keys(forbidden), "packages/domain/src/absolute.ts"].sort(),
      );
    },
  );
});

it("rejects CommonJS imports with the repository's built-in lint rule", () => {
  fixture({ "require.ts": 'require("effect");\nimport effect = require("effect");' }, (root) => {
    const result = run(root, oxlint, [
      "-c",
      path.join(repository, ".oxlintrc.json"),
      "--format",
      "json",
      "require.ts",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.output.match(/"code": "typescript\(no-require-imports\)"/g)).toHaveLength(2);
  });
});
