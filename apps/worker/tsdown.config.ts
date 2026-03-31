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
    "src/sequence-scheduler/worker.ts",
    "src/sequence-scheduler/worker-producer.ts",
    "src/sequence-scheduler/worker-consumer.ts",
    "src/schedule/worker.ts",
  ],
  dts: true,
  shims: true,
  deps: {
    skipNodeModulesBundle: false,
    // https://github.com/egoist/tsdown/issues/619
    alwaysBundle: [/(.*)/],
    neverBundle: ["react"],
  },
  clean: true,
  // target: 'node20',
  platform: "node",
  minify: true,
  unbundle: false,
  // splitting: false,
  // esbuildOptions(options) {
  //   options.jsx = "automatic"
  // },
  sourcemap: false,
  treeshake: true,
})
