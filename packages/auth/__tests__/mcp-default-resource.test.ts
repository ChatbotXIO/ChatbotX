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

  it("keeps a resource the client supplied", () => {
    expect(
      defaultMcpResource({
        path: "/oauth2/authorize",
        query: { resource: "https://other/mcp" },
      }),
    ).toBeUndefined()
  })

  it("ignores unrelated paths", () => {
    expect(defaultMcpResource({ path: "/sign-in/email" })).toBeUndefined()
  })
})
