import { defineConfig } from "tsdown"

export default defineConfig({
  format: ["cjs", "esm"],
  entry: ["src/index.ts"],
  dts: true,
  shims: true,
  deps: {
    skipNodeModulesBundle: false,
    // https://github.com/egoist/tsdown/issues/619
    alwaysBundle: [/(.*)/],
  },
  clean: true,
  copy: [{ from: "src/guides/*.md", to: "dist/guides" }],
  target: "node24",
  platform: "node",
  minify: true,
  unbundle: false,
  // splitting: false,
  // external: ["react"],
  // esbuildOptions(options) {
  //   options.jsx = "automatic"
  // },
  sourcemap: true,
  treeshake: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
})
