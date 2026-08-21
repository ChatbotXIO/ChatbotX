import { defineConfig } from "tsdown"

export default defineConfig({
  format: ["esm"],
  entry: ["src/index.ts"],
  dts: false,
  shims: true,
  deps: {
    skipNodeModulesBundle: false,
    // https://github.com/egoist/tsdown/issues/619
    alwaysBundle: [/(.*)/],
    neverBundle: ["isolated-vm"],
  },
  clean: true,
  platform: "node",
  minify: false,
  unbundle: false,
  sourcemap: true,
  treeshake: true,
})
