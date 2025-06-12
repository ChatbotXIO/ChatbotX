import { defineConfig } from "tsup"

export default defineConfig({
  format: ["cjs", "esm"],
  entry: ["src/chat/worker.ts", "src/integration/worker.ts"],
  dts: true,
  shims: true,
  skipNodeModulesBundle: true,
  clean: true,
  // target: 'node20',
  platform: "node",
  minify: true,
  bundle: true,
  // https://github.com/egoist/tsup/issues/619
  noExternal: [/(.*)/],
  splitting: false,
  external: ["react"],
  esbuildOptions(options) {
    options.jsx = "automatic"
  },
})
