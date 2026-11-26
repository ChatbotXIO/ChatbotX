// @vitest-environment node

import { describe, expect, test, vi } from "vitest"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"

const { anyPermissionGate, captured, authorizedGate, permissionGate } =
  vi.hoisted(() => {
    const captured: {
      path: string
      use: { middleware: unknown }[]
    }[] = []
    const authorizedGate = { kind: "authorized" }
    const permissionGate = (key: string) => ({ kind: "permission", key })
    const anyPermissionGate = (keys: string[]) => ({ kind: "any", keys })
    return { anyPermissionGate, authorizedGate, captured, permissionGate }
  })

vi.mock("@chatbotx.io/business", () => ({ postTopicService: {} }))
vi.mock("@/features/post-analytics/lib/operations", () => ({
  postAnalyticsOperations: {},
}))
vi.mock("@/middlewares/auth", () => ({
  workspaceAnyPermissionMiddleware: anyPermissionGate,
  workspaceAuthorizedMidddleware: authorizedGate,
  workspacePermissionMiddleware: permissionGate,
}))
vi.mock("@/orpc", () => {
  const makeProcedure = (path: string) => {
    const uses: { middleware: unknown }[] = []
    captured.push({ path, use: uses })
    const chain = {
      handler: vi.fn(() => ({ uses })),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      use: vi.fn((middleware: unknown) => {
        uses.push({ middleware })
        return chain
      }),
    }
    return chain
  }
  return {
    authorizedAPI: {
      route: (config: { path: string }) => makeProcedure(config.path),
    },
  }
})

await import("@/features/post-analytics/api/private")
await import("@/features/post-topics/api/private")

const requiredPermission = (path: string): unknown =>
  captured
    .find((procedure) => procedure.path.endsWith(path))
    ?.use.find((entry) => entry.middleware !== authorizedGate)?.middleware

const DASHBOARD_PATHS = [
  "/post-analytics/summary",
  "/post-analytics/timeseries",
  "/post-analytics/top-posts",
  "/post-analytics/best-times",
  "/post-analytics/topics",
]
const PER_POST_PATHS = [
  "/channel-posts/management/{id}/metrics",
  "/social-posts/{id}/metrics",
]

describe("post analytics private procedures", () => {
  test.each(
    DASHBOARD_PATHS,
  )("%s accepts the analytics or the broadcast permission", (path) => {
    const gate = requiredPermission(path) as { keys: string[]; kind: string }
    expect(gate.kind).toBe("any")
    expect([...gate.keys].sort()).toEqual(["analytics", "broadcast"])
  })

  test.each(
    PER_POST_PATHS,
  )("%s keeps the broadcast permission of the Posts pages", (path) => {
    expect(requiredPermission(path)).toEqual({
      kind: "permission",
      key: "broadcast",
    })
  })

  test("the Posts management topic list keeps the broadcast permission", () => {
    expect(requiredPermission("/workspaces/{workspaceId}/post-topics")).toEqual(
      { kind: "permission", key: "broadcast" },
    )
  })

  test.each([
    ["analytics only", { analytics: true }, true],
    ["broadcast only", { broadcast: true }, true],
    ["both", { analytics: true, broadcast: true }, true],
    ["neither", {}, false],
  ])("%s: overview allowed=%s", (_name, permissions, allowed) => {
    const gate = requiredPermission("/post-analytics/summary") as {
      keys: Parameters<typeof hasWorkspacePermission>[1][]
    }
    const passes = gate.keys.some((key) =>
      hasWorkspacePermission(permissions, key),
    )
    expect(passes).toBe(allowed)
  })
})
