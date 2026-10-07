import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, test, vi } from "vitest"

// A cache written by an older CLI carries the old (colliding) command names.
// Loading it must re-derive names so the new commands appear without waiting
// for the cache to expire.
const home = mkdtempSync(join(tmpdir(), "cli-cache-"))
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: () => home,
}))

const { loadOpenApiSpecForCli } = await import("../src/openapi-loader")

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
})

const tool = (method: string, pathTemplate: string, commandName: string) => ({
  baseUrl: "https://api.example.com",
  bodyParamNames: [],
  commandName,
  description: "",
  inputSchema: { type: "object", properties: {} },
  method,
  pathParamNames: [],
  pathTemplate,
  queryParamNames: [],
})

describe("loadOpenApiSpecForCli with a cache from an older CLI", () => {
  test("re-derives command names instead of returning the cached ones", async () => {
    const apiUrl = "https://api.example.com/api"
    mkdirSync(join(home, ".chatbotX"), { recursive: true })
    writeFileSync(
      join(home, ".chatbotX", "openapi-cache.json"),
      JSON.stringify({
        url: `${apiUrl}/public-spec.json`,
        fetchedAt: Date.now(),
        tools: [
          tool(
            "DELETE",
            "/v1/contacts/{identifier}/custom-fields",
            "contacts:custom-field:delete",
          ),
          tool("PUT", "/v1/bot-fields/{idOrName}", "bot-fields:update"),
        ],
      }),
    )

    const tools = await loadOpenApiSpecForCli(apiUrl)

    expect(tools.map((t) => t.commandName)).toEqual([
      "contacts:clear-all-custom-fields",
      "bot-fields:set",
    ])
  })
})
