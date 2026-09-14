// @vitest-environment node
import type { HTTPMethod } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { WORKSPACE_DELETION_PATH } from "@/features/workspaces/lib/api-paths"

// Every test-observable behavior below is decided by `isWorkspaceScheduledForDeletion`
// (mocked, per test) and `assertWorkspaceOwnerAccessForMethod` (real — the
// regression under test is exercised through it, backed by mocked quota
// services below).
const isWorkspaceScheduledForDeletion = vi.fn((_workspace: unknown) => false)
const findWorkspaceByTokenHash = vi.fn(
  async (_props: unknown) => undefined as unknown,
)
const getAccessState = vi.fn(async (_userId: string) => undefined as unknown)
const isAtLimit = vi.fn(async (_props: unknown) => false)

vi.mock("@chatbotx.io/business", () => ({
  isWorkspaceScheduledForDeletion: (workspace: unknown) =>
    isWorkspaceScheduledForDeletion(workspace),
  workspaceApiTokenService: {
    findWorkspaceByTokenHash: (props: unknown) =>
      findWorkspaceByTokenHash(props),
  },
  userQuotaService: {
    getAccessState: (userId: string) => getAccessState(userId),
  },
  quotaEnforcementService: {
    isAtLimit: (props: unknown) => isAtLimit(props),
  },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  withAuditContext: (_ctx: unknown, fn: () => unknown) => fn(),
}))

const isCloud = vi.fn(() => false)
vi.mock("@/env", () => ({ isCloud: () => isCloud() }))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited: vi.fn(async () => undefined),
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.1",
}))

// Imported after the `vi.mock` calls above; Vitest hoists `vi.mock` to the
// top of the module regardless of declaration order, so this static import
// resolves against the mocked dependency graph.
import { workspaceTokenAuthMidddleware } from "../workspace-token-auth"

type CallOptions = {
  method: HTTPMethod
  path: string
}

const NEXT_SENTINEL = { ok: true }

const callMiddleware = ({ method, path }: CallOptions) =>
  workspaceTokenAuthMidddleware(
    {
      context: {
        headers: new Headers({ Authorization: "Bearer cbx_ws_test-token" }),
      },
      // The middleware only ever calls `next({ context })`; returning a
      // sentinel lets tests assert the middleware reached the end of its
      // chain instead of throwing earlier.
      next: async () => NEXT_SENTINEL,
      procedure: { "~orpc": { route: { method, path } } },
    } as never,
    undefined as never,
    (() => undefined) as never,
  )

const workspaceFixture = { id: "workspace-1", ownerId: "owner-1" }
const apiTokenFixture = {
  id: "token-1",
  workspaceId: "workspace-1",
  permission: "full" as const,
  scopes: null,
  isDefault: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  isCloud.mockReturnValue(false)
  isAtLimit.mockResolvedValue(false)
  findWorkspaceByTokenHash.mockImplementation(async () => ({
    workspace: workspaceFixture,
    apiToken: apiTokenFixture,
  }))
})

describe("workspaceTokenAuthMidddleware — deletion lifecycle", () => {
  test("cancelDeletion (DELETE /v1/workspace/deletion) succeeds on an already-scheduled workspace", async () => {
    isWorkspaceScheduledForDeletion.mockReturnValue(true)

    await expect(
      callMiddleware({ method: "DELETE", path: WORKSPACE_DELETION_PATH }),
    ).resolves.toBe(NEXT_SENTINEL)
  })

  test("every other route stays locked out once deletion is scheduled", async () => {
    isWorkspaceScheduledForDeletion.mockReturnValue(true)

    await expect(
      callMiddleware({ method: "GET", path: "/v1/workspace" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test("scheduleDeletion (POST /v1/workspace/deletion) succeeds for a trial-expired owner", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({
      blocked: true,
      planName: null,
      reason: "status",
      status: "expired",
      trialEndsAt: null,
    })

    await expect(
      callMiddleware({ method: "POST", path: WORKSPACE_DELETION_PATH }),
    ).resolves.toBe(NEXT_SENTINEL)
  })

  test("other mutations stay blocked for a trial-expired owner", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({
      blocked: true,
      planName: null,
      reason: "status",
      status: "expired",
      trialEndsAt: null,
    })

    await expect(
      callMiddleware({ method: "POST", path: "/v1/workspace" }),
    ).rejects.toMatchObject({ code: "trialExpired" })
  })
})
