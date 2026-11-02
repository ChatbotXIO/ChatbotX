import { describe, expect, it, vi } from "vitest"

vi.mock("../src/keys", () => ({
  getMcpResourceUrl: () => "https://app.example.com/mcp",
}))

import { defaultMcpResource } from "../src/mcp-config"

const RESOURCE = "https://app.example.com/mcp"

describe("defaultMcpResource", () => {
  it("injects the resource into an authorize query that omits it", () => {
    expect(
      defaultMcpResource({
        path: "/oauth2/authorize",
        query: { client_id: "c" },
      }),
    ).toEqual({ context: { query: { client_id: "c", resource: RESOURCE } } })
  })

  it("injects the resource into a token body that omits it", () => {
    expect(
      defaultMcpResource({ path: "/oauth2/token", body: { code: "x" } }),
    ).toEqual({ context: { body: { code: "x", resource: RESOURCE } } })
  })

  it("normalizes ChatGPT's legacy SSE endpoint to the registered resource", () => {
    expect(
      defaultMcpResource({
        path: "/oauth2/authorize",
        query: { client_id: "c", resource: `${RESOURCE}/sse` },
      }),
    ).toEqual({
      context: { query: { client_id: "c", resource: RESOURCE } },
    })
  })

  it("normalizes the streamable HTTP endpoint to the registered resource", () => {
    expect(
      defaultMcpResource({
        path: "/oauth2/authorize",
        query: { resource: `${RESOURCE}/messages` },
      }),
    ).toEqual({ context: { query: { resource: RESOURCE } } })
  })

  it("normalizes the legacy endpoint when exchanging the authorization code", () => {
    expect(
      defaultMcpResource({
        path: "/oauth2/token",
        body: { code: "x", resource: `${RESOURCE}/sse` },
      }),
    ).toEqual({ context: { body: { code: "x", resource: RESOURCE } } })
  })
  it("keeps a resource the client supplied", () => {
    expect(
      defaultMcpResource({
        path: "/oauth2/authorize",
        query: { resource: "https://other/mcp" },
      }),
    ).toBeUndefined()
  })

  it("keeps a token resource the client supplied", () => {
    expect(
      defaultMcpResource({
        path: "/oauth2/token",
        body: { resource: "https://other/mcp" },
      }),
    ).toBeUndefined()
  })

  it("keeps multiple requested resources untouched", () => {
    expect(
      defaultMcpResource({
        path: "/oauth2/authorize",
        query: { resource: ["https://other/mcp"] },
      }),
    ).toBeUndefined()
  })
  it("ignores unrelated paths", () => {
    expect(defaultMcpResource({ path: "/sign-in/email" })).toBeUndefined()
  })
})
