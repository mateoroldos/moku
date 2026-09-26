interface Workspace {
  readonly name: string;
  readonly directory: string;
  readonly dependencies: ReadonlyArray<string>;
}

export const workspaceScope = "@moku/";

export const workspaces: ReadonlyArray<Workspace> = [
  { name: "@moku/web", directory: "apps/web", dependencies: ["@moku/ui"] },
  { name: "@moku/ui", directory: "packages/ui", dependencies: [] },
  { name: "@moku/domain", directory: "packages/domain", dependencies: [] },
  { name: "@moku/core", directory: "packages/core", dependencies: ["@moku/domain"] },
];
