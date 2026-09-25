import { definePlugin, defineRule, type ESTree } from "@oxlint/plugins";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- Oxlint plugins run in Node and use synchronous path resolution.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workspaces, workspaceScope } from "../architecture/workspaces.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

function workspaceDirectory(filename: string): string | undefined {
  return /^(?:apps|packages|adapters)\/[^/]+(?:\/|$)/
    .exec(path.relative(root, filename).split(path.sep).join("/"))?.[0]
    .replace(/\/$/, "");
}

function importTarget(filename: string, specifier: string): string | undefined {
  if (specifier.startsWith(workspaceScope)) return specifier.split("/").slice(0, 2).join("/");
  const resolved = specifier.startsWith(".")
    ? path.resolve(path.dirname(filename), specifier)
    : path.isAbsolute(specifier)
      ? specifier
      : undefined;
  if (resolved === undefined) return undefined;
  const directory = workspaceDirectory(resolved);
  if (directory === undefined) return undefined;
  return workspaces.find((entry) => entry.directory === directory)?.name ?? directory;
}

function moduleSpecifier(source: ESTree.Expression): string | undefined {
  if (source.type === "Literal") {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ESTree literals include strings, numbers, booleans, and regexes.
    return typeof source.value === "string" ? source.value : undefined;
  }
  if (source.type === "TemplateLiteral" && source.expressions.length === 0) {
    return source.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

const noCrossWorkspaceImports = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Enforce the shared workspace dependency policy on source imports." },
    messages: {
      forbidden: "{{source}} must not import {{target}}. See tools/architecture/workspaces.ts.",
    },
  },
  create(context) {
    const directory = workspaceDirectory(context.filename);
    const workspace = workspaces.find((entry) => entry.directory === directory);
    if (workspace === undefined) return {};
    const { name, dependencies } = workspace;

    function check(node: ESTree.Node, source: ESTree.Expression) {
      const specifier = moduleSpecifier(source);
      if (specifier === undefined) return;
      const target = importTarget(context.filename, specifier);
      if (target !== undefined && target !== name && !dependencies.includes(target)) {
        context.report({ node, messageId: "forbidden", data: { source: name, target } });
      }
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source);
      },
      ExportAllDeclaration(node) {
        check(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) check(node, node.source);
      },
      ImportExpression(node) {
        check(node, node.source);
      },
      TSImportType(node) {
        check(node, node.source);
      },
    };
  },
});

export default definePlugin({
  meta: { name: "workspace-boundaries" },
  rules: { "no-cross-workspace-imports": noCrossWorkspaceImports },
});
