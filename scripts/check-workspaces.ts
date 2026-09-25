import { Glob, file, stderr, write } from "bun";
import { Result, Schema } from "effect";
import { workspaces, workspaceScope } from "../tools/architecture/workspaces.ts";

const Manifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    devDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    peerDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  }),
);
const decodeManifest = Schema.decodeUnknownResult(Manifest);
const manifests = [
  ...new Glob("apps/*/package.json").scanSync(),
  ...new Glob("packages/*/package.json").scanSync(),
  ...new Glob("adapters/*/package.json").scanSync(),
];
const violations: Array<string> = [];

for (const workspace of workspaces) {
  if (!manifests.includes(`${workspace.directory}/package.json`)) {
    violations.push(`${workspace.directory}/package.json: missing manifest for ${workspace.name}`);
  }
}

for (const manifestPath of manifests) {
  const decoded = decodeManifest(await file(manifestPath).text());
  if (Result.isFailure(decoded)) {
    violations.push(`${manifestPath}: invalid package manifest: ${decoded.failure.message}`);
    continue;
  }
  const manifest = decoded.success;
  const workspace = workspaces.find((entry) => entry.name === manifest.name);
  if (workspace === undefined) {
    violations.push(`${manifestPath}: add ${manifest.name} to tools/architecture/workspaces.ts`);
    continue;
  }
  if (manifestPath !== `${workspace.directory}/package.json`) {
    violations.push(`${manifestPath}: ${manifest.name} belongs in ${workspace.directory}`);
  }
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  };
  for (const dependency of Object.keys(dependencies)) {
    if (dependency.startsWith(workspaceScope) && !workspace.dependencies.includes(dependency)) {
      violations.push(`${manifest.name} must not depend on ${dependency}`);
    }
  }
}

if (violations.length > 0) {
  await write(stderr, `${violations.join("\n")}\n`);
  process.exitCode = 1;
}
