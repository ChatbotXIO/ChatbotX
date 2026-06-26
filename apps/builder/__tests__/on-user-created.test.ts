// @vitest-environment node

import type { AuthCreatedUser } from "@chatbotx.io/auth/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { ensureBootstrapPlan, isCloud, loggerWarn, quotaQueueAdd } = vi.hoisted(
  () => ({
    ensureBootstrapPlan: vi.fn(async () => undefined),
    isCloud: vi.fn(() => true),
    loggerWarn: vi.fn(),
    quotaQueueAdd: vi.fn(async () => undefined),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  userQuotaService: { ensureBootstrapPlan },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  QuotaJobAction: { publishEntitlements: "publishEntitlements" },
  quotaQueue: { add: quotaQueueAdd },
}))

vi.mock("@/env", () => ({ isCloud }))
vi.mock("@/lib/log", () => ({ logger: { warn: loggerWarn } }))

const { onUserCreated } = await import("@/lib/auth/on-user-created")

const user = (overrides: Partial<AuthCreatedUser> = {}) =>
  ({
    id: "user-1",
    isAnonymous: false,
    ...overrides,
  }) as AuthCreatedUser

beforeEach(() => {
  vi.clearAllMocks()
  isCloud.mockReturnValue(true)
  ensureBootstrapPlan.mockResolvedValue(undefined)
  quotaQueueAdd.mockResolvedValue(undefined)
})

describe("onUserCreated quota bootstrap", () => {
  test("stamps the bootstrap plan before enqueueing entitlements on cloud", async () => {
    const calls: string[] = []
    ensureBootstrapPlan.mockImplementation(() => {
      calls.push("bootstrap")
      return Promise.resolve(undefined)
    })
    quotaQueueAdd.mockImplementation(() => {
      calls.push("enqueue")
      return Promise.resolve(undefined)
    })

    await onUserCreated(user())

    expect(ensureBootstrapPlan).toHaveBeenCalledWith({
      userId: "user-1",
      tenantId: undefined,
    })
    expect(quotaQueueAdd).toHaveBeenCalledWith("publishEntitlements", {
      type: "publishEntitlements",
      data: { userId: "user-1" },
    })
    expect(calls).toEqual(["bootstrap", "enqueue"])
  })

  test("skips bootstrap and enqueue outside cloud", async () => {
    isCloud.mockReturnValue(false)

    await onUserCreated(user())

    expect(ensureBootstrapPlan).not.toHaveBeenCalled()
    expect(quotaQueueAdd).not.toHaveBeenCalled()
  })

  test("skips bootstrap and enqueue for anonymous users", async () => {
    await onUserCreated(user({ isAnonymous: true }))

    expect(ensureBootstrapPlan).not.toHaveBeenCalled()
    expect(quotaQueueAdd).not.toHaveBeenCalled()
  })

  test("continues enqueueing when bootstrap stamping fails", async () => {
    const err = new Error("db down")
    ensureBootstrapPlan.mockRejectedValue(err)

    await expect(onUserCreated(user())).resolves.toBeUndefined()

    expect(quotaQueueAdd).toHaveBeenCalledWith("publishEntitlements", {
      type: "publishEntitlements",
      data: { userId: "user-1" },
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      { err, userId: "user-1" },
      "Failed to stamp bootstrap quota on sign-up",
    )
  })

  test("passes tenant id to the bootstrap stamp", async () => {
    await onUserCreated(user({ tenantId: "tenant-42" }))

    expect(ensureBootstrapPlan).toHaveBeenCalledWith({
      userId: "user-1",
      tenantId: "tenant-42",
    })
  })
})
