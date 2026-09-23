import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { env } from "../src/env"

/**
 * `.env.example` documents the recommended `CHATBOTX_MCP_SERVER_INSTRUCTIONS`
 * value, which must stay word-for-word identical to `env.ts`'s
 * `defaultMcpInstructions` -- a drifted copy is invisible until someone
 * compares them by hand (see `docs(mcp): sync instruction example`, the
 * commit that fixed exactly this drift once already). This test pins them
 * together so a future edit to one side that forgets the other fails CI
 * instead of silently drifting again.
 */
describe("CHATBOTX_MCP_SERVER_INSTRUCTIONS sync", () => {
  test(".env.example matches the env.ts default", async () => {
    const envExamplePath = fileURLToPath(
      new URL("../.env.example", import.meta.url),
    )
    const envExampleContent = await readFile(envExamplePath, "utf8")
    const line = envExampleContent
      .split("\n")
      .find((candidate) =>
        candidate.startsWith("CHATBOTX_MCP_SERVER_INSTRUCTIONS="),
      )

    expect(line).toBeDefined()
    const documentedValue = (line as string).slice(
      "CHATBOTX_MCP_SERVER_INSTRUCTIONS=".length,
    )

    expect(documentedValue).toBe(env.CHATBOTX_MCP_SERVER_INSTRUCTIONS)
  })
})
