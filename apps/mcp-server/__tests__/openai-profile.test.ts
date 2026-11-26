import { afterEach, describe, expect, test, vi } from "vitest"
import { openAiProfileSpec } from "./fixtures/openai-profile-spec"

const loader = vi.hoisted(() => ({ spec: null as unknown }))

vi.mock("../src/openapi-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/openapi-loader")>()
  loader.spec = openAiProfileSpec
  return { ...actual, getCachedSpec: () => loader.spec }
})

import { validateAgainstSchema } from "../src/profiles/json-schema-validate"
import {
  executeOpenAiTool,
  handleOpenAiGuide,
  listOpenAiTools,
} from "../src/profiles/openai"
import { buildOpenAiManifest } from "../src/profiles/openai-manifest-builder"
import {
  projectResponse,
  ResponseContractError,
} from "../src/profiles/project-response"

const DYNAMIC_TOOL_NAMES = /search_tools|call_tool/
const POST_REQUEST = /^POST /
const credentials = { token: "t", workspaceId: "w1" }
const tools = listOpenAiTools(null)
const builtTools = buildOpenAiManifest(openAiProfileSpec).tools
const getOpenAiTool = (name: string) =>
  builtTools.find((tool) => tool.name === name)
const names = new Set(tools.map((tool) => tool.name))

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  })

afterEach(() => vi.unstubAllGlobals())

describe("OpenAI profile tools", () => {
  test("serves the contract's operations present in the spec, plus get_guide", () => {
    expect([...names].sort()).toEqual(
      [
        "broadcasts_list",
        "broadcasts_stop",
        "contacts_add_tags_by_name",
        "contacts_create",
        "contacts_list",
        "contacts_send_message",
        "get_guide",
        "token_get",
      ].sort(),
    )
  })

  test("reports contract operations the spec lacks instead of throwing", () => {
    const { missing } = buildOpenAiManifest(openAiProfileSpec)
    expect(missing).toContain("flows_list")
    expect(missing).not.toContain("contacts_list")
  })

  test("never serves deferred or dynamic tools", () => {
    for (const name of ["contacts_send_flow", "search_tools", "call_tool"]) {
      expect(names.has(name)).toBe(false)
    }
  })

  test("every tool carries an oauth2 security scheme", () => {
    for (const tool of tools) {
      expect(tool.securitySchemes).toEqual([{ type: "oauth2" }])
    }
  })

  test("an ordinary update drops _confirm; outbound and destructive keep it", () => {
    const hasConfirm = (name: string) =>
      "_confirm" in
      (getOpenAiTool(name)?.inputSchema as { properties: object }).properties
    expect(getOpenAiTool("contacts_add_tags_by_name")?.hitlPolicy).toBe("none")
    expect(hasConfirm("contacts_add_tags_by_name")).toBe(false)
    expect(getOpenAiTool("contacts_send_message")?.hitlPolicy).toBe(
      "confirm_outbound",
    )
    expect(hasConfirm("contacts_send_message")).toBe(true)
    expect(hasConfirm("broadcasts_stop")).toBe(true)
  })

  test("contacts_create never accepts gender", () => {
    const schema = getOpenAiTool("contacts_create")?.inputSchema as {
      properties: Record<string, unknown>
      required?: string[]
    }
    expect(schema.properties).not.toHaveProperty("gender")
    expect(schema.required ?? []).not.toContain("gender")
  })

  test("a new spec object rebuilds the tools; with no spec only get_guide is served", () => {
    const previous = loader.spec
    try {
      loader.spec = null
      expect(listOpenAiTools(null).map((tool) => tool.name)).toEqual([
        "get_guide",
      ])
      loader.spec = structuredClone(openAiProfileSpec)
      expect(listOpenAiTools(null)).toHaveLength(tools.length)
    } finally {
      loader.spec = previous
    }
  })

  test("a read-only token lists no write tools", () => {
    const readOnly = listOpenAiTools({
      permission: "read_only",
      scopes: null,
      workspaceId: "w1",
    })
    for (const tool of readOnly) {
      expect(tool.annotations.readOnlyHint, tool.name).toBe(true)
    }
    expect(readOnly.length).toBeGreaterThan(1)
  })

  test("a scoped token lists only its scopes plus always-visible tools", () => {
    const scoped = listOpenAiTools({
      permission: "full",
      scopes: ["contacts"],
      workspaceId: "w1",
    })
    const scopedNames = new Set(scoped.map((tool) => tool.name))
    expect(scopedNames.has("contacts_list")).toBe(true)
    expect(scopedNames.has("token_get")).toBe(true)
    expect(scopedNames.has("broadcasts_list")).toBe(false)
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

  test("an unconfirmed destructive write performs no mutation and returns a pending approval", async () => {
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
      "broadcasts_stop",
      { id: "7" },
      credentials,
    )
    // A pending approval is not a failure.
    expect(result.isError).toBeUndefined()
    expect(calls.every((call) => call.startsWith("GET"))).toBe(true)
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("CONFIRMATION_REQUIRED")
    expect(text).not.toContain("gender")
    expect(text).not.toContain("secret")
  })

  test("an ordinary update runs without the _confirm round trip", async () => {
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        calls.push(`${init.method} ${url}`)
        return Promise.resolve(jsonResponse({ data: [] }))
      }),
    )
    const result = await executeOpenAiTool(
      "contacts_add_tags_by_name",
      { identifier: "id:7", tags: ["VIP"] },
      credentials,
    )
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]?.text ?? "null")).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(POST_REQUEST)
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
  test("withholds an unreviewed free-form body as explicit success", () => {
    const anyShape = { anyOf: [{}, { not: {} }] }
    expect(projectResponse(anyShape as never, { data: [1] })).toEqual({
      ok: true,
    })
  })
  test("represents an empty body explicitly", () => {
    expect(projectResponse(null, undefined)).toEqual({ ok: true })
  })
})
