import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  outExtension() {
    return {
      js: ".js",
    }
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
})
