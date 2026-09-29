import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  sourcemap: true,
  treeshake: true,
  unbundle: true,
})
