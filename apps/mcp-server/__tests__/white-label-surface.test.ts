import { afterEach, describe, expect, test, vi } from "vitest"
import { openAiProfileSpec } from "./fixtures/openai-profile-spec"

// Live-spec tool text is covered in apps/builder/__tests__/public-spec-mcp.test.ts.
vi.mock("../src/openapi-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/openapi-loader")>()),
  getCachedSpec: () => openAiProfileSpec,
}))

import { getGuide, guideNames } from "../src/guides"
import { CLAUDE_INSTRUCTIONS } from "../src/profiles/claude-guides"
import {
  executeOpenAiTool,
  handleOpenAiGuide,
  listOpenAiTools,
  openAiGuideResources,
} from "../src/profiles/openai"
import {
  OPENAI_GUIDE_NAMES,
  OPENAI_INSTRUCTIONS,
} from "../src/profiles/openai-guides"
import { META_TOOLS } from "../src/server/meta-tools"

/**
 * One MCP server serves every white-label tenant, so nothing a client or
 * model sees may name the platform brand. (The Claude profile's live tools
 * are covered in claude-profile.test.ts.)
 */
const BRAND = /chatbotx/i
const credentials = { token: "t", workspaceId: "w1" }

afterEach(() => vi.unstubAllGlobals())

describe("white-label surface", () => {
  test("OpenAI tools, instructions, guides and resources", () => {
    const surface = JSON.stringify({
      guides: OPENAI_GUIDE_NAMES.map((name) => handleOpenAiGuide({ name })),
      instructions: OPENAI_INSTRUCTIONS,
      resources: openAiGuideResources(),
      tools: listOpenAiTools(null),
    })
    expect(surface).not.toMatch(BRAND)
  })

  test("Claude instructions", () => {
    expect(CLAUDE_INSTRUCTIONS).not.toMatch(BRAND)
  })

  test("default profile guides and discovery tools", () => {
    const surface = JSON.stringify({
      guides: guideNames.map((name) => getGuide(name)),
      metaTools: META_TOOLS,
    })
    expect(surface).not.toMatch(BRAND)
  })

  test("OpenAI error messages", async () => {
    const texts: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 503 })),
    )
    texts.push(
      (await executeOpenAiTool("contacts_list", {}, credentials)).content[0]
        ?.text ?? "",
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    )
    texts.push(
      (await executeOpenAiTool("contacts_list", {}, credentials)).content[0]
        ?.text ?? "",
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{bad", {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
      ),
    )
    texts.push(
      (await executeOpenAiTool("contacts_list", {}, credentials)).content[0]
        ?.text ?? "",
    )
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(BRAND)
    }
  })
})
