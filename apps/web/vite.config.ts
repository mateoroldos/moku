import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-node";
import { sveltekit, type Config } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const paths: NonNullable<Config["paths"]> = {};
  const origin = loadEnv(mode, "../..", "ORIGIN").ORIGIN;
  if (command === "build" && origin !== undefined) paths.origin = origin;
  return {
    plugins: [
      tailwindcss(),
      sveltekit({
        compilerOptions: {
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
          experimental: { async: true },
        },
        adapter: adapter(),
        paths,
        experimental: { remoteFunctions: true },
      }),
    ],
    ssr: { noExternal: [/^@moku\//] },
  };
});
