import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  tags: string[]
  successStatus?: number
}
type Handler = (args: { context: unknown; input: unknown }) => Promise<unknown>
type Captured = { route: RouteConfig; handler?: Handler }

const { workspaceTokenAuthAPIForScope, captured } = vi.hoisted(() => {
  const captured: Captured[] = []
  const api = {
    route: (route: RouteConfig) => {
      const record: Captured = { route }
      captured.push(record)
      const chain = {
        input: () => chain,
        output: () => chain,
        errors: () => chain,
        handler: (fn: Handler) => {
          record.handler = fn
          return { handler: fn }
        },
      }
      return chain
    },
  }
  return {
    workspaceTokenAuthAPIForScope: vi.fn((_scope: string) => api),
    captured,
  }
})
vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const responseSlaService = {
  findPolicy: vi.fn(),
  upsertPolicy: vi.fn(),
  deletePolicy: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  responseSlaService,
  RESPONSE_SLA_MIN_TARGET_SECONDS: 60,
  RESPONSE_SLA_MAX_TARGET_SECONDS: 2_592_000,
}))
const assertWorkspaceNotBlocked = vi.fn()
vi.mock("@/lib/workspace-quota", () => ({ assertWorkspaceNotBlocked }))

await import("@/features/response-sla/api/public")
const scopeAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

const find = (method: string) => {
  const found = captured.find((p) => p.route.method === method)
  if (!found?.handler) {
    throw new Error(`No procedure for ${method}`)
  }
  return found as Captured & { handler: Handler }
}

const context = { workspace: { id: "ws-1", ownerId: "owner-1" } }
const now = new Date("2026-01-01T00:00:00Z")
const row = {
  id: "1",
  workspaceId: "ws-1",
  enabled: true,
  firstResponseTargetSeconds: 600,
  nextResponseTargetSeconds: null,
  breachingThresholdPercent: 25,
  createdAt: now,
  updatedAt: now,
}

beforeEach(() => vi.clearAllMocks())

describe("response SLA public API", () => {
  test("uses the inbox scope and a single /v1/response-sla path", () => {
    expect(scopeAtImport).toBe("inbox")
    expect(captured).toHaveLength(3)
    expect(captured.every((p) => p.route.path === "/v1/response-sla")).toBe(
      true,
    )
    expect(captured.every((p) => p.route.tags[0] === "Response SLA")).toBe(true)
  })

  test("get returns the policy resource, or null when none is configured", async () => {
    responseSlaService.findPolicy.mockResolvedValueOnce(row)
    await expect(find("GET").handler({ context, input: {} })).resolves.toEqual({
      enabled: true,
      firstResponseTargetSeconds: 600,
      nextResponseTargetSeconds: null,
      breachingThresholdPercent: 25,
      createdAt: now,
      updatedAt: now,
    })
    responseSlaService.findPolicy.mockResolvedValueOnce(null)
    await expect(
      find("GET").handler({ context, input: {} }),
    ).resolves.toBeNull()
    expect(responseSlaService.findPolicy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    })
  })

  test("update replaces the policy after the blocked-owner guard", async () => {
    responseSlaService.upsertPolicy.mockResolvedValueOnce(row)
    const input = {
      enabled: false,
      firstResponseTargetSeconds: 600,
      nextResponseTargetSeconds: null,
      breachingThresholdPercent: 25,
    }

    await find("PUT").handler({ context, input })

    expect(assertWorkspaceNotBlocked).toHaveBeenCalledWith("owner-1")
    expect(responseSlaService.upsertPolicy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: input,
    })
  })

  test("a blocked owner stops the update before the service runs", async () => {
    assertWorkspaceNotBlocked.mockRejectedValueOnce(new Error("blocked"))

    await expect(
      find("PUT").handler({
        context,
        input: {
          firstResponseTargetSeconds: 600,
          nextResponseTargetSeconds: null,
          breachingThresholdPercent: 25,
        },
      }),
    ).rejects.toThrow("blocked")
    expect(responseSlaService.upsertPolicy).not.toHaveBeenCalled()
  })

  test("delete returns 204 and removes the workspace policy", async () => {
    const procedure = find("DELETE")

    await procedure.handler({ context, input: {} })

    expect(procedure.route.successStatus).toBe(204)
    expect(responseSlaService.deletePolicy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    })
  })
})
