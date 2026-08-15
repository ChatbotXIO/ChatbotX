import preset from "@chatbotx.io/vitest-config/node"
import { defineConfig, mergeConfig } from "vitest/config"

export default mergeConfig(
  preset,
  defineConfig({
    test: {
      coverage: {
        exclude: ["src/index.ts"],
      },
    },
  }),
)
