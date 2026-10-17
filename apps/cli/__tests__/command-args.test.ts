import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import yargs from "yargs"
import { collectCliParams, registerActionArgs } from "../src/command-args"
import { executeDynamicCommand } from "../src/dynamic-executor"
import type { DynamicTool } from "../src/openapi-loader"

const statsTool: DynamicTool = {
  baseUrl: "https://api.example.com",
  bodyParamNames: [],
  commandName: "analytics:new-contacts-count",
  description: "Count new contacts",
  inputSchema: {
    properties: {
      from: { type: "string" },
      channels: { items: { type: "string" }, type: "array" },
      inboxIds: { items: { type: "string" }, type: "array" },
    },
    type: "object",
  },
  method: "GET",
  pathParamNames: [],
  pathTemplate: "/v1/analytics/new-contacts-count",
  queryParamNames: ["from", "channels", "inboxIds"],
}

const parse = async (args: string[]) => {
  const argv = await registerActionArgs(
    yargs(args).exitProcess(false),
    statsTool,
  )
    .strict(false)
    .parseAsync()
  return collectCliParams(statsTool, argv as Record<string, unknown>)
}

describe("array query flags", () => {
  const originalFetch = globalThis.fetch
  const originalWrite = process.stdout.write.bind(process.stdout)

  beforeEach(() => {
    process.stdout.write = vi.fn(
      () => true,
    ) as unknown as typeof process.stdout.write
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.stdout.write = originalWrite
  })

  const run = async (args: string[]) => {
    const fetchMock = vi.fn().mockResolvedValue({
      headers: { get: () => "application/json" },
      json: async () => ({ data: { count: 1 } }),
      ok: true,
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await executeDynamicCommand(statsTool, await parse(args), {
      apiKey: "k",
      apiUrl: "https://api.example.com",
    })
    return decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]))
  }

  test("a repeated flag becomes indexed bracket params", async () => {
    const url = await run([
      "--from",
      "2026-10-01",
      "--channels",
      "messenger",
      "--channels",
      "whatsapp",
    ])

    expect(url).toBe(
      "https://api.example.com/v1/analytics/new-contacts-count?from=2026-10-01&channels[0]=messenger&channels[1]=whatsapp",
    )
  })

  test("a single value is still a one-item array", async () => {
    const url = await run(["--inboxIds", "12"])

    expect(url).toContain("inboxIds[0]=12")
    expect(url).not.toContain("inboxIds=12")
  })

  test("several values after one flag are collected too", async () => {
    const url = await run(["--channels", "messenger", "whatsapp"])

    expect(url).toContain("channels[0]=messenger&channels[1]=whatsapp")
  })

  test("an omitted flag sends nothing (All)", async () => {
    const url = await run(["--from", "2026-10-01"])

    expect(url).not.toContain("channels")
    expect(url).not.toContain("inboxIds")
  })

  test("scalar flags are untouched", async () => {
    expect(await parse(["--from", "2026-10-01"])).toEqual({
      from: "2026-10-01",
    })
  })
})
