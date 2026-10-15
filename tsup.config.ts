import { defineConfig, type Options } from "tsup";

// 两种产物共用 Koishi CJS 入口，避免 ESM Loader 的模块互操作错误。
const koishiInterop: NonNullable<Options["esbuildPlugins"]>[number] = {
  name: "koishi-commonjs-interop",
  setup(build) {
    build.onResolve({ filter: /^koishi$/ }, () => build.initialOptions.format === "esm"
      ? { path: "koishi", namespace: "koishi-cjs" }
      : { path: "koishi", external: true });
    build.onLoad({ filter: /.*/, namespace: "koishi-cjs" }, () => ({
      contents: `import { createRequire } from "node:module";
const koishi = createRequire(import.meta.url)("koishi");
export const { Context, Schema, Service, Time, Logger, version } = koishi;`,
      loader: "js",
    }));
  },
};

export default defineConfig({
  entry: { index: "src/index.ts", "core/index": "src/core/index.ts", "business/index": "src/business/index.ts" },
  outDir: "lib", format: ["cjs", "esm"], dts: true, splitting: false,
  sourcemap: true, clean: true, external: ["cocofaith-sdk"],
  noExternal: ["koishi"], esbuildPlugins: [koishiInterop],
});
