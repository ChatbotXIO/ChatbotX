// @vitest-environment node

import type * as RedisModule from "@chatbotx.io/redis"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  requestTemplateInstall: vi.fn(),
  records: new Map<string, Record<string, unknown>>(),
}))

const matches = (
  current: Record<string, unknown> | undefined,
  expected: Record<string, unknown>,
) =>
  Boolean(current) &&
  Object.entries(expected).every(([field, value]) => current?.[field] === value)

// An in-memory stand-in for the Redis compare-and-set store the idempotency
// middleware claims keys in.
vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof RedisModule>()
  return {
    ...actual,
    casStore: {
      setIfAbsent: (key: string, value: Record<string, unknown>) => {
        if (mocks.records.has(key)) {
          return Promise.resolve(false)
        }
        mocks.records.set(key, value)
        return Promise.resolve(true)
      },
      getJson: (key: string) => Promise.resolve(mocks.records.get(key) ?? null),
      compareAndDelete: (key: string, expected: Record<string, unknown>) => {
        if (!matches(mocks.records.get(key), expected)) {
          return Promise.resolve(false)
        }
        mocks.records.delete(key)
        return Promise.resolve(true)
      },
      compareAndSwap: (
        key: string,
        expected: Record<string, unknown> | null,
        next: Record<string, unknown>,
      ) => {
        if (!(expected && matches(mocks.records.get(key), expected))) {
          return Promise.resolve(false)
        }
        mocks.records.set(key, next)
        return Promise.resolve(true)
      },
    },
  }
})

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: {
    findWorkspaceByTokenHash: mocks.findWorkspaceByTokenHash,
  },
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  userQuotaService: {
    getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  },
  quotaEnforcementService: { isAtLimit: vi.fn().mockResolvedValue(false) },
  templateService: {},
  templateInstallationRequestService: {},
  resolveTenantSettings: vi.fn(),
}))
vi.mock("@chatbotx.io/business/template-uninstall", () => ({
  templateUninstallService: {},
}))
vi.mock("../src/features/templates/lib/request-install", () => ({
  requestTemplateInstall: mocks.requestTemplateInstall,
  enqueueInstall: vi.fn(),
  enqueueSync: vi.fn(),
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { templateInstallationsPublicRouter } = await import(
  "../src/features/templates/api/public"
)

const contextWithKey = (key: string) => ({
  context: {
    headers: new Headers({
      Authorization: "Bearer cbx_ws_fixture",
      "Idempotency-Key": key,
    }),
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.records.clear()
  let counter = 0
  mocks.requestTemplateInstall.mockImplementation(() => {
    counter += 1
    return Promise.resolve({ installationId: String(100 + counter) })
  })
  mocks.findWorkspaceByTokenHash.mockResolvedValue({
    workspace: { id: "ws-1", ownerId: "owner-1", tenantId: "tenant-1" },
    apiToken: { id: "token-1", permission: "full", scopes: null },
  })
})

describe("templateInstallations.install idempotency", () => {
  test("replays the same key and body: the same installationId, and one install request", async () => {
    const input = { shareToken: "tok-a", allowDuplicate: false }

    const first = await call(
      templateInstallationsPublicRouter.install,
      input,
      contextWithKey("key-1"),
    )
    const second = await call(
      templateInstallationsPublicRouter.install,
      input,
      contextWithKey("key-1"),
    )

    expect(second).toEqual(first)
    expect(mocks.requestTemplateInstall).toHaveBeenCalledTimes(1)
    expect(mocks.requestTemplateInstall).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "key-1" }),
    )
  })

  test("rejects the same key with a different body as idempotencyKeyReused", async () => {
    await call(
      templateInstallationsPublicRouter.install,
      { shareToken: "tok-a" },
      contextWithKey("key-2"),
    )

    await expect(
      call(
        templateInstallationsPublicRouter.install,
        { shareToken: "tok-b" },
        contextWithKey("key-2"),
      ),
    ).rejects.toMatchObject({ code: "idempotencyKeyReused" })
    expect(mocks.requestTemplateInstall).toHaveBeenCalledTimes(1)
  })

  test("a different key is a new request with a new installation", async () => {
    const input = { shareToken: "tok-a" }

    const first = await call(
      templateInstallationsPublicRouter.install,
      input,
      contextWithKey("key-3"),
    )
    const second = await call(
      templateInstallationsPublicRouter.install,
      input,
      contextWithKey("key-4"),
    )

    expect(second.installationId).not.toBe(first.installationId)
    expect(mocks.requestTemplateInstall).toHaveBeenCalledTimes(2)
  })
})
