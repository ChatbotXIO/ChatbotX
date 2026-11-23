import { afterEach, describe, expect, test, vi } from "vitest"
import { validateAgainstSchema } from "../src/profiles/json-schema-validate"
import {
  executeOpenAiTool,
  getOpenAiTool,
  handleOpenAiGuide,
  listOpenAiTools,
} from "../src/profiles/openai"
import {
  OPENAI_DEFERRED_TOOLS,
  OPENAI_EXCLUDED_TOOLS,
} from "../src/profiles/openai-contract"
import {
  projectResponse,
  ResponseContractError,
} from "../src/profiles/project-response"

const DOTTED_OPERATION = /`([a-zA-Z]+\.[a-zA-Z]+)`/g
const DYNAMIC_TOOL_NAMES = /search_tools|call_tool/
const UPPER = /([A-Z])/g
const credentials = { token: "t", workspaceId: "w1" }
const tools = listOpenAiTools()
const names = new Set(tools.map((tool) => tool.name))

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  })

afterEach(() => vi.unstubAllGlobals())

describe("OpenAI manifest", () => {
  test("lists 36 API tools plus get_guide", () => {
    expect(tools).toHaveLength(37)
    expect(names.has("get_guide")).toBe(true)
  })

  test("omits dynamic, deferred and excluded tools", () => {
    for (const name of [
      "search_tools",
      "call_tool",
      ...OPENAI_DEFERRED_TOOLS,
      ...OPENAI_EXCLUDED_TOOLS,
    ]) {
      expect(names.has(name)).toBe(false)
    }
  })

  test("every tool has four boolean hints and an oauth2 security scheme", () => {
    for (const tool of tools) {
      for (const hint of [
        "readOnlyHint",
        "destructiveHint",
        "idempotentHint",
        "openWorldHint",
      ] as const) {
        expect(typeof tool.annotations[hint], `${tool.name}.${hint}`).toBe(
          "boolean",
        )
      }
      expect(tool.securitySchemes).toEqual([{ type: "oauth2" }])
    }
  })

  test("outbound and irreversible tools carry the expected hints", () => {
    expect(getOpenAiTool("contacts_send_message")?.annotations).toMatchObject({
      destructiveHint: true,
      openWorldHint: true,
      readOnlyHint: false,
    })
    expect(getOpenAiTool("broadcasts_stop")?.annotations.destructiveHint).toBe(
      true,
    )
  })

  test("descriptions only reference tools in the profile", () => {
    const toName = (id: string) =>
      id.replace(UPPER, "_$1").toLowerCase().replace(".", "_")
    for (const tool of tools) {
      for (const match of JSON.stringify(tool).matchAll(DOTTED_OPERATION)) {
        expect(
          names.has(toName(match[1] as string)),
          `${tool.name}: ${match[1]}`,
        ).toBe(true)
      }
      expect(JSON.stringify(tool)).not.toMatch(DYNAMIC_TOOL_NAMES)
    }
  })

  test("contacts_create never accepts gender", () => {
    const schema = getOpenAiTool("contacts_create")?.inputSchema as {
      properties: Record<string, unknown>
      required?: string[]
    }
    expect(schema.properties).not.toHaveProperty("gender")
    expect(schema.required ?? []).not.toContain("gender")
  })

  test("input schemas contain no free-form objects", () => {
    const walk = (node: unknown, where: string): void => {
      if (Array.isArray(node)) {
        for (const item of node) {
          walk(item, where)
        }
        return
      }
      if (node && typeof node === "object") {
        const schema = node as Record<string, unknown>
        if (schema.type === "object" && !schema.properties) {
          expect(schema.additionalProperties, where).toBe(false)
        }
        for (const value of Object.values(schema)) {
          walk(value, where)
        }
      }
    }
    for (const tool of tools) {
      walk(tool.inputSchema, tool.name)
    }
  })

  test("get_guide exposes only profile guides", () => {
    expect(handleOpenAiGuide({ name: "flows-and-automation" }).isError).toBe(
      true,
    )
    expect(
      handleOpenAiGuide({ name: "overview" }).content[0]?.text,
    ).not.toMatch(DYNAMIC_TOOL_NAMES)
  })
})

describe("input validation", () => {
  const schema = getOpenAiTool("contacts_create")?.inputSchema
  test("rejects unknown and caller-supplied gender properties", () => {
    const problems = validateAgainstSchema(schema, {
      channel: "webchat",
      email: "a@b.co",
      gender: "male",
      inboxId: "1",
    })
    expect(problems.join()).toContain("gender: unknown property")
  })
})

describe("execution", () => {
  test("unknown tools return a tool error without a request", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    for (const name of ["search_tools", "call_tool", "flows_publish", "nope"]) {
      const result = await executeOpenAiTool(name, {}, credentials)
      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toBe(`Unknown tool: ${name}`)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("invalid arguments fail before any request, even with _confirm", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const result = await executeOpenAiTool(
      "contacts_create",
      {
        _confirm: true,
        channel: "webchat",
        email: "a@b.co",
        gender: "male",
        inboxId: "1",
      },
      credentials,
    )
    expect(result.isError).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("an unconfirmed write performs no mutation and projects current state", async () => {
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        calls.push(`${init.method} ${url}`)
        return jsonResponse({
          id: "7",
          gender: "male",
          firstName: "Ada",
          notes: "secret",
        })
      }),
    )
    const result = await executeOpenAiTool(
      "contacts_add_tags_by_name",
      { identifier: "id:7", tags: ["VIP"] },
      credentials,
    )
    expect(result.isError).toBe(true)
    expect(calls.every((call) => call.startsWith("GET"))).toBe(true)
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("CONFIRMATION_REQUIRED")
    expect(text).not.toContain("gender")
    expect(text).not.toContain("secret")
  })

  test("a confirmed contact create sends gender unknown from the adapter", async () => {
    let sent: Record<string, unknown> = {}
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body))
        return Promise.resolve(jsonResponse({ id: "9", firstName: "Ada" }, 201))
      }),
    )
    const result = await executeOpenAiTool(
      "contacts_create",
      { _confirm: true, channel: "webchat", email: "a@b.co", inboxId: "1" },
      credentials,
    )
    expect(result.isError).toBeUndefined()
    expect(sent.gender).toBe("unknown")
  })

  test("API errors never leak the raw body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ message: "SELECT * FROM secret", stack: "x" }, 500),
      ),
    )
    const result = await executeOpenAiTool("contacts_list", {}, credentials)
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).not.toContain("SELECT")
  })

  test("a network failure is reported as unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    )
    const result = await executeOpenAiTool("contacts_list", {}, credentials)
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("could not be reached")
  })

  test("an unreadable upstream body is not reported as unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{not json", {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
      ),
    )
    const result = await executeOpenAiTool("contacts_list", {}, credentials)
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).not.toContain("could not be reached")
    expect(result.content[0]?.text).toContain("could not be read")
  })

  test("a malformed mutation response warns the action may have completed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse("not-an-object")),
    )
    const result = await executeOpenAiTool(
      "broadcasts_stop",
      { _confirm: true, id: "1" },
      credentials,
    )
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("may have completed")
  })
})

describe("projectResponse", () => {
  const schema = {
    type: "object",
    properties: {
      id: { type: "string" },
      gender: { type: "string" },
      nested: {
        type: "object",
        properties: { a: { type: "string" }, token: { type: "string" } },
      },
    },
  }
  test("copies only permitted fields without mutating the source", () => {
    const source = {
      id: "1",
      gender: "x",
      extra: 1,
      nested: { a: "k", token: "t", z: 1 },
    }
    const copy = structuredClone(source)
    expect(projectResponse(schema, source)).toEqual({
      id: "1",
      nested: { a: "k" },
    })
    expect(source).toEqual(copy)
  })
  test("rejects malformed shapes instead of returning empty success", () => {
    expect(() => projectResponse(schema, "oops")).toThrow(ResponseContractError)
  })
  test("projects each anyOf branch once, even when unions are nested", () => {
    let calls = 0
    const counted = {
      type: "object",
      get properties() {
        calls += 1
        return { id: { type: "string" } }
      },
    }
    // Four levels of two-branch unions: exponential re-projection would
    // evaluate the leaf 2^4 * 2 times; once-per-branch evaluates it 2^4 times.
    let nested: Record<string, unknown> = counted
    for (let level = 0; level < 4; level += 1) {
      nested = { anyOf: [nested, nested] }
    }
    expect(projectResponse(nested as never, { id: "1" })).toEqual({ id: "1" })
    expect(calls).toBeLessThanOrEqual(2 ** 4 * 2)
  })
  test("keeps the branches that match a union", () => {
    const union = {
      anyOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "string" },
      ],
    }
    expect(projectResponse(union as never, { a: "x", b: 1 })).toEqual({
      a: "x",
    })
    expect(projectResponse(union as never, "plain")).toBe("plain")
    expect(() => projectResponse(union as never, 5)).toThrow(
      ResponseContractError,
    )
  })
  test("represents an empty body explicitly", () => {
    expect(projectResponse(null, undefined)).toEqual({ ok: true })
  })
})
