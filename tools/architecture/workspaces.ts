interface Workspace {
  readonly name: string;
  readonly directory: string;
  readonly dependencies: ReadonlyArray<string>;
}

export const workspaceScope = "@moku/";

export const workspaces: ReadonlyArray<Workspace> = [
  {
    name: "@moku/web",
    directory: "apps/web",
    dependencies: ["@moku/ui", "@moku/core", "@moku/domain", "@moku/database-postgres"],
  },
  {
    name: "@moku/database-postgres",
    directory: "adapters/database-postgres",
    dependencies: ["@moku/core", "@moku/domain"],
  },
  { name: "@moku/ui", directory: "packages/ui", dependencies: [] },
  { name: "@moku/domain", directory: "packages/domain", dependencies: [] },
  { name: "@moku/core", directory: "packages/core", dependencies: ["@moku/domain"] },
];
