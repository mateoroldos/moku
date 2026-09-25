import { Glob, YAML } from "bun";
import { Result, Schema } from "effect";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SkillName = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  Schema.isMaxLength(64),
);
const SkillMetadata = Schema.Struct({
  name: SkillName,
  description: Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(1024)),
});
const SkillLock = Schema.fromJsonString(
  Schema.Struct({ skills: Schema.Record(SkillName, Schema.Unknown) }),
);

const root = path.resolve(process.argv[2] ?? ".");
const patterns = [
  "*.md",
  ".agents/skills/**/*.md",
  "docs/**/*.md",
  "patches/**/*.md",
  "apps/*/*.md",
  "apps/*/docs/**/*.md",
  "packages/*/*.md",
  "adapters/*/*.md",
];
const files = new Set(
  patterns.flatMap((pattern) => [...new Glob(pattern).scanSync({ cwd: root })]),
);
const violations: Array<string> = [];
const lockPath = path.join(root, "skills-lock.json");
const managedSkills = new Set<string>();
if (existsSync(lockPath)) {
  const lock = Schema.decodeSync(SkillLock)(readFileSync(lockPath, "utf8"));
  for (const name of Object.keys(lock.skills)) {
    managedSkills.add(name);
    const entrypoint = `.agents/skills/${name}/SKILL.md`;
    if (!files.has(entrypoint)) violations.push(`${entrypoint}: locked skill is missing`);
  }
}

for (const file of [...files].sort((left, right) => left.localeCompare(right))) {
  const absolute = path.resolve(root, file);
  const text = readFileSync(absolute, "utf8");

  if (path.basename(file) === "SKILL.md") {
    const metadata = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] ?? "";
    const yaml = Result.try(() => YAML.parse(metadata));
    if (Result.isFailure(yaml)) {
      violations.push(`${file}: invalid YAML frontmatter`);
    } else {
      const decoded = Schema.decodeUnknownResult(SkillMetadata, { errors: "all" })(yaml.success);
      if (Result.isFailure(decoded)) {
        violations.push(`${file}: invalid skill metadata: ${decoded.failure.message}`);
      } else if (decoded.success.name !== path.basename(path.dirname(file))) {
        violations.push(`${file}: name must match its directory`);
      }
    }
  }

  // Upstream bundles use their own links, not this repository's conventions.
  if (file.startsWith(".agents/skills/") && managedSkills.has(file.split("/")[2] ?? "")) continue;

  // Check prose links, not illustrative Markdown inside fenced code blocks.
  const prose = text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
  for (const match of prose.matchAll(/\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (target === undefined || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    const destination = target.split("#")[0] ?? "";
    const decoded = Result.try(() => decodeURIComponent(destination));
    if (Result.isFailure(decoded)) {
      violations.push(`${file}: invalid link encoding: ${target}`);
      continue;
    }
    const resolved = decoded.success.startsWith("/")
      ? path.resolve(root, decoded.success.slice(1))
      : path.resolve(path.dirname(absolute), decoded.success);
    const local = path.relative(root, resolved);
    if (local === ".." || local.startsWith(`..${path.sep}`) || !existsSync(resolved)) {
      violations.push(`${file}: missing or non-repository link target: ${target}`);
    }
  }
}

if (files.size === 0) violations.push("No guidance files found; run from the repository root.");
if (violations.length > 0) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked guidance in ${files.size} Markdown files.\n`);
}
