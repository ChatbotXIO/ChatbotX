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
  // target: 'node20',
  platform: "node",
  minify: true,
  unbundle: false,
  // splitting: false,
  // external: ["react"],
  // esbuildOptions(options) {
  //   options.jsx = "automatic"
  // },
  sourcemap: false,
  treeshake: true,
})
