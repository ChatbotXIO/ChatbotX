import { defineConfig } from "tsdown"

export default defineConfig({
  format: ["esm"],
  entry: [
    // Loaded first via node --import; initializes Sentry before any worker runs.
    "src/instrument.ts",
    "src/chat/worker.ts",
    "src/integration/worker.ts",
    "src/ai-agent/worker.ts",
    "src/default/worker.ts",
    "src/trigger/worker.ts",
    "src/webhook/worker.ts",
    "src/sequence-scheduler/worker.ts",
    "src/sequence-scheduler/worker-producer.ts",
    "src/sequence-scheduler/worker-consumer.ts",
    "src/schedule/worker.ts",
    "src/events/worker.ts",
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
  // Emit source maps so node --enable-source-maps and Sentry map stack traces
  // in the bundled .mjs output back to the original TypeScript sources.
  sourcemap: true,
  treeshake: true,
})
