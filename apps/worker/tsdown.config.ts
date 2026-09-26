import { defineConfig } from "tsdown"

export default defineConfig({
  format: ["esm"],
  entry: [
    // Single-process bundles: core consumers (`worker core`), and core plus
    // schedule (`worker standalone`, the image default).
    "src/core.ts",
    "src/standalone.ts",
    "src/chat/worker.ts",
    "src/integration/worker.ts",
    "src/ai-agent/worker.ts",
    "src/heavy/worker.ts",
    "src/default/worker.ts",
    "src/trigger/worker.ts",
    "src/webhook/worker.ts",
    "src/sequence-scheduler/worker.ts",
    "src/sequence-scheduler/worker-producer.ts",
    "src/sequence-scheduler/worker-consumer.ts",
    "src/schedule/worker.ts",
    "src/events/worker.ts",
    "src/notification/worker.ts",
    "src/low/worker.ts",
  ],
  dts: false,
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
  minify: false,
  unbundle: false,
  // splitting: false,
  sourcemap: true,
  treeshake: true,
})
