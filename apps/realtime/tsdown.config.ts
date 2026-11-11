import { defineConfig } from "tsdown"

export default defineConfig({
  format: ["esm"],
  entry: ["src/main.ts"],
  dts: false,
  shims: true,
  deps: {
    skipNodeModulesBundle: false,
    alwaysBundle: [/(.*)/],
    neverBundle: ["uWebSockets.js"],
  },
  clean: true,
  platform: "node",
  minify: false,
  unbundle: false,
  sourcemap: true,
  treeshake: true,
})
