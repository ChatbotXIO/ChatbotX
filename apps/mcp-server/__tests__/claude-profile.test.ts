import { describe, expect, test, vi } from "vitest"
import { claudeProfileSpec } from "./fixtures/claude-profile-spec"

const loader = vi.hoisted(() => ({ tools: [] as unknown[] }))

vi.mock("../src/openapi-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/openapi-loader")>()
  loader.tools = actual.parseToolsFromSpec(claudeProfileSpec as never)
  const tools = loader.tools as ReturnType<typeof actual.parseToolsFromSpec>
  return {
    ...actual,
    getToolByName: (name: string) => tools.find((tool) => tool.name === name),
    getVisibleTools: () =>
      tools.filter((tool) => tool.visibility === "default"),
  }
})

import {
  claudeGuideResources,
  getClaudeTool,
  handleClaudeGuide,
  listClaudeTools,
  omitTransportOnlyFields,
} from "../src/profiles/claude"
import {
  CLAUDE_API_TOOLS,
  CLAUDE_EXCLUDED_TOOLS,
  CLAUDE_READ_TOOLS,
  CLAUDE_WRITE_TOOLS,
} from "../src/profiles/claude-contract"
import { CLAUDE_GUIDES } from "../src/profiles/claude-guides"
import { jsonResult } from "../src/server/execute-tool"

const MAX_TOOL_NAME_LENGTH = 64
const BRAND = /chatbotx/i
const BACKTICKED_SNAKE_NAME = /`([a-z]+(?:_[a-z]+)+)`/g

describe("Claude profile contract", () => {
  test("read and write lists do not overlap or repeat", () => {
    const all = [...CLAUDE_READ_TOOLS, ...CLAUDE_WRITE_TOOLS]
    expect(new Set(all).size).toBe(all.length)
    expect(CLAUDE_API_TOOLS).toHaveLength(all.length)
  })

  test("excluded operations are never in the profile", () => {
    for (const name of CLAUDE_EXCLUDED_TOOLS) {
      expect(CLAUDE_API_TOOLS).not.toContain(name)
    }
  })

  test("every tool name fits the directory limit", () => {
    for (const name of [...CLAUDE_API_TOOLS, "get_guide"]) {
      expect(name.length, name).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH)
    }
  })

  test("guides only name tools this profile serves", () => {
    const served = new Set<string>([...CLAUDE_API_TOOLS, "get_guide"])
    for (const [guide, { content }] of Object.entries(CLAUDE_GUIDES)) {
      for (const [, name] of content.matchAll(BACKTICKED_SNAKE_NAME)) {
        expect(served.has(name as string), `${guide}: ${name}`).toBe(true)
      }
    }
  })
})

describe("Claude profile tools/list", () => {
  const tools = listClaudeTools(null)
  const names = tools.map((tool) => tool.name)

  test("serves profile operations and get_guide, never a pass-through tool", () => {
    expect(names).toEqual([
      "contacts_list",
      "contacts_create",
      "contacts_get",
      "get_guide",
    ])
    expect(names).not.toContain("call_tool")
    expect(names).not.toContain("search_tools")
    expect(names).not.toContain("connections_create")
  })

  test("every tool has a title and the hint the directory requires", () => {
    for (const tool of tools) {
      expect(tool.annotations.title, tool.name).toBeTruthy()
      const { readOnlyHint, destructiveHint } = tool.annotations
      expect(readOnlyHint !== destructiveHint, tool.name).toBe(true)
    }
  })

  test("a write is destructive even when route metadata says otherwise", () => {
    const create = tools.find((tool) => tool.name === "contacts_create")
    expect(create?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    })
  })

  test("descriptions drop sentences that name operations outside the profile", () => {
    const list = tools.find((tool) => tool.name === "contacts_list")
    expect(list?.description).toContain("`contacts.get`")
    expect(list?.description).not.toContain("bulkDelete")

    const create = tools.find((tool) => tool.name === "contacts_create")
    const nameField = (
      create?.inputSchema.properties as Record<string, { description?: string }>
    ).name
    expect(nameField?.description).toBe("Display name.")
  })
})

describe("Claude profile tool lookup", () => {
  test("resolves profile tools with profile annotations", () => {
    expect(getClaudeTool("contacts_create")?.annotations.destructiveHint).toBe(
      true,
    )
  })

  test("refuses operations outside the profile, even ones the spec has", () => {
    expect(getClaudeTool("contacts_bulk_delete")).toBeUndefined()
    expect(getClaudeTool("connections_create")).toBeUndefined()
    expect(getClaudeTool("call_tool")).toBeUndefined()
  })
})

describe("Claude profile guides", () => {
  test("returns a known guide", () => {
    const result = handleClaudeGuide({ name: "flows-and-automation" })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain("flows_publish")
  })

  test("rejects an unknown guide", () => {
    expect(handleClaudeGuide({ name: "nope" }).isError).toBe(true)
  })
})

describe("transport-only response fields", () => {
  test("token_get never shows the verified principal", () => {
    const result = omitTransportOnlyFields(
      "token_get",
      jsonResult({
        permission: "full",
        principal: { credentialType: "oauth", subject: "42" },
        workspaceId: "w1",
      }),
    )
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      permission: "full",
      workspaceId: "w1",
    })
  })

  test("other tools and error results pass through unchanged", () => {
    const other = jsonResult({ principal: "kept" })
    expect(omitTransportOnlyFields("contacts_get", other)).toBe(other)
    const failed = { ...jsonResult({ principal: "x" }), isError: true }
    expect(omitTransportOnlyFields("token_get", failed)).toBe(failed)
  })
})

describe("white-label surface", () => {
  test("tools, guides and resources never name the platform brand", () => {
    const surface = JSON.stringify({
      guides: CLAUDE_GUIDES,
      resources: claudeGuideResources(),
      tools: listClaudeTools(null),
    })
    expect(surface).not.toMatch(BRAND)
  })
})
