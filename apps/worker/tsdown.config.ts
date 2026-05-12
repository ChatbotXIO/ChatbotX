import { defineConfig } from "tsdown"
import { workers } from "./src/workers.ts"

export default defineConfig({
  format: ["esm"],
  entry: workers.map((w) => w.entry),
  dts: false,
  shims: true,
  deps: {
    skipNodeModulesBundle: false,
    // https://github.com/egoist/tsdown/issues/619
    alwaysBundle: [/(.*)/],
    neverBundle: ["react"],
  },
  clean: true,
  platform: "node",
  minify: false,
  unbundle: false,
  sourcemap: false,
  treeshake: true,
})
