import { defineConfig } from "tsdown"

export default defineConfig({
  format: ["cjs", "esm"],
  entry: ["src/index.ts"],
  dts: true,
  shims: true,
  skipNodeModulesBundle: false,
  clean: true,
  // target: 'node20',
  platform: "node",
  minify: true,
  unbundle: false,
  // https://github.com/egoist/tsdown/issues/619
  noExternal: [/(.*)/],
  // splitting: false,
  // external: ["react"],
  // esbuildOptions(options) {
  //   options.jsx = "automatic"
  // },
  sourcemap: false,
  treeshake: true,
})
