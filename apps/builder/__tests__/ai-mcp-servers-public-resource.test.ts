import { describe, expect, test } from "vitest"
import { publicAIMcpServerResource } from "@/features/ai-mcp-servers/schema/public"

// The three new public-API router tests
// (ai-mcp-servers-public-api.test.ts) stub `.output()` as a no-op, so
// deleting `.omit({ auth: true })` from the resource schema would not fail
// anything there. This test parses a row through the *real*
// publicAIMcpServerResource to prove the secret is actually stripped by the
// schema itself, for both auth types that carry one.
const baseRow = {
  id: "1",
  workspaceId: "1",
  name: "Docs MCP",
  url: "https://mcp.example.com",
  availableTools: {},
  selectedTools: [],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

describe("publicAIMcpServerResource auth redaction", () => {
  test("strips the bearer token for type: token", () => {
    const result = publicAIMcpServerResource.parse({
      ...baseRow,
      auth: { type: "token", token: "super-secret-token" },
    })

    expect(result.auth).toEqual({ type: "token" })
    expect(JSON.stringify(result)).not.toContain("super-secret-token")
  })

  test("strips header values for type: header", () => {
    const result = publicAIMcpServerResource.parse({
      ...baseRow,
      auth: {
        type: "header",
        headers: [{ header: "X-Api-Key", value: "super-secret-value" }],
      },
    })

    expect(result.auth).toEqual({
      type: "header",
      headers: [{ header: "X-Api-Key" }],
    })
    expect(JSON.stringify(result)).not.toContain("super-secret-value")
  })

  test("passes through type: none with no secret fields", () => {
    const result = publicAIMcpServerResource.parse({
      ...baseRow,
      auth: { type: "none" },
    })

    expect(result.auth).toEqual({ type: "none" })
  })
})
