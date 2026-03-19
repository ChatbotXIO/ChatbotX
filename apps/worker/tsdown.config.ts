import { defineConfig } from "tsdown"

export default defineConfig({
  format: ["cjs", "esm"],
  entry: [
    "src/chat/worker.ts",
    "src/integration/worker.ts",
    "src/ai-agent/worker.ts",
    "src/default/worker.ts",
    "src/trigger/worker.ts",
    "src/webhook/worker.ts",
    "src/analytics/worker.ts",
  ],
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
  external: ["react"],
  // esbuildOptions(options) {
  //   options.jsx = "automatic"
  // },
  sourcemap: false,
  treeshake: true,
})
