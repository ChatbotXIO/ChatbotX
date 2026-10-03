// @vitest-environment node

import { call } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { webchatsPublicRouter } from "../src/features/integration-webchat/api/public"
import { integrationsCrudPublicRouter } from "../src/features/integrations/api/public/crud"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  integrationService,
  integrationWebchatService,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  integrationService: { listByWorkspaceId: vi.fn() },
  integrationWebchatService: { list: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  integrationService,
  integrationWebchatService,
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

const invokeIntegrations = () =>
  call(
    integrationsCrudPublicRouter.list,
    { page: 1, perPage: 50 },
    {
      context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
    },
  )

const invokeWebchats = () =>
  call(
    webchatsPublicRouter.list,
    { page: 1, perPage: 50 },
    {
      context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
    },
  )

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: connections public API scope wiring", () => {
  test("denies the former integrations route to a token without connections", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invokeIntegrations()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'connections' scope",
    })
  })

  test("allows the former integrations route to a connections-scoped token", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["connections"]))
    integrationService.listByWorkspaceId.mockResolvedValue([])

    await expect(invokeIntegrations()).resolves.toMatchObject({ data: [] })
  })

  test("denies a former channels route without connections scope", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invokeWebchats()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'connections' scope",
    })
  })

  test("allows a former channels route with connections scope", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["connections"]))
    integrationWebchatService.list.mockResolvedValue({
      data: [],
      total: 0,
      pageCount: 0,
    })

    await expect(invokeWebchats()).resolves.toEqual({
      data: [],
      pageCount: 0,
    })
  })

  test("keeps unrestricted tokens authorized after the scope merge", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    integrationWebchatService.list.mockResolvedValue({
      data: [],
      total: 0,
      pageCount: 0,
    })

    await expect(invokeWebchats()).resolves.toEqual({
      data: [],
      pageCount: 0,
    })
  })
})
