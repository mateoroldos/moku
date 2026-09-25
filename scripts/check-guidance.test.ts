import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const checker = fileURLToPath(new URL("./check-guidance.ts", import.meta.url));
const skill = ".agents/skills/example/SKILL.md";

function runFixture(files: Readonly<Record<string, string>>) {
  const root = mkdtempSync(path.join(tmpdir(), "guidance-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const filename = path.join(root, name);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, content);
    }
    const result = spawnSync("bun", [checker, root], { encoding: "utf8", timeout: 10_000 });
    if (result.error) throw result.error;
    return { output: result.stdout + result.stderr, exitCode: result.status };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

it("accepts local links and skill YAML without interpreting command examples", () => {
  const result = runFixture({
    "README.md":
      `[skill](${skill})\n[route](route%28test%29.ts)\n` +
      "[remote](https://example.com)\n[section](#section)\n`bun run package-local-script`\n" +
      "```md\n[illustration](not-a-real-file.md)\n```\n",
    "route(test).ts": "",
    [skill]: '---\nname: "example"\ndescription: >\n  Example workflow\n  with folded YAML.\n---\n',
    "patches/README.md": "[root](../README.md)\n",
  });
  expect(result.exitCode, result.output).toBe(0);
});

it("reports stale links and invalid skill metadata", () => {
  const result = runFixture({
    "README.md": "[old](removed.md)\n",
    [skill]: "---\nname: wrong-name\ndescription: \n---\n",
    "patches/README.md": "[old](removed.md)\n",
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("README.md: missing or non-repository link target: removed.md");
  expect(result.output).toContain(
    "patches/README.md: missing or non-repository link target: removed.md",
  );
  expect(result.output).toContain("SKILL.md: invalid skill metadata");
  expect(result.output).toContain("description");
});

it("accepts upstream links while checking managed skill metadata and entrypoints", () => {
  const upstream = ".agents/skills/upstream/SKILL.md";
  const bundle = {
    "skills-lock.json": '{"version":1,"skills":{"upstream":{}}}',
    [upstream]:
      "---\nname: upstream\ndescription: |\n  Upstream workflow.\n---\n[route](/tutorial)\n",
    ".agents/skills/upstream/references/guide.md": "[route](/tutorial)\n",
  };
  const valid = runFixture({ ...bundle, "README.md": `[upstream](${upstream})` });
  expect(valid.exitCode, valid.output).toBe(0);

  const invalid = runFixture({
    ...bundle,
    [skill]: "---\nname: wrong\ndescription: Local workflow.\n---\n",
    [upstream]: '---\nname: upstream\ndescription: ""\n---\n',
  });
  expect(invalid.exitCode).toBe(1);
  expect(invalid.output).toContain("example/SKILL.md: name must match its directory");
  expect(invalid.output).toContain("upstream/SKILL.md: invalid skill metadata");

  const missing = runFixture({ "skills-lock.json": bundle["skills-lock.json"] });
  expect(missing.exitCode).toBe(1);
  expect(missing.output).toContain("upstream/SKILL.md: locked skill is missing");
});

it("rejects malformed YAML with a useful diagnostic", () => {
  const result = runFixture({ [skill]: "---\nname: [unterminated\n---\n" });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("SKILL.md: invalid YAML frontmatter");
});
