import { db } from "@chatbotx.io/database/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const LEGACY_TX = { marker: "legacy-tx" }

const mocks = vi.hoisted(() => ({
  applyProviderAccountEvent: vi.fn(),
  releasePendingQuota: vi.fn(),
  markLegacyInboxUnhealthy: vi.fn(),
  disableCoexist: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(LEGACY_TX)),
  },
}))
vi.mock("../state-service", () => ({
  connectionStateService: {
    applyProviderAccountEvent: mocks.applyProviderAccountEvent,
    releasePendingQuota: mocks.releasePendingQuota,
    markLegacyInboxUnhealthy: mocks.markLegacyInboxUnhealthy,
  },
}))
vi.mock("../../coexist/service", () => ({
  coexistService: { disable: mocks.disableCoexist },
}))
vi.mock("../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { providerAccountEventService } = await import(
  "../provider-account-event-service"
)

const request = (
  overrides: Partial<
    Parameters<typeof providerAccountEventService.applyToTarget>[0]["request"]
  > = {},
) => ({
  integrationType: "whatsapp" as const,
  event: "offboarded" as const,
  detail: { reason: "unknown", initiatedBy: "unknown" },
  occurredAt: new Date("2026-11-04T10:00:00Z"),
  ...overrides,
})

const target = (overrides: Record<string, unknown> = {}) => ({
  integrationId: "int-1",
  workspaceId: "ws-1",
  workspaceOwnerId: "owner-1",
  inboxId: "inbox-1",
  connectionId: "conn-1" as string | null,
  ...overrides,
})

type AppliedInput = { lastError?: string }
const appliedInput = (): AppliedInput =>
  mocks.applyProviderAccountEvent.mock.calls[0]?.[0] as AppliedInput

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.transaction).mockImplementation((async (
    fn: (tx: unknown) => unknown,
  ) => fn(LEGACY_TX)) as typeof db.transaction)
  mocks.releasePendingQuota.mockResolvedValue(undefined)
  mocks.applyProviderAccountEvent.mockResolvedValue({ outcome: "apply" })
  mocks.disableCoexist.mockResolvedValue(undefined)
})

describe("providerAccountEventService.applyToTarget", () => {
  test("an offboard is applied in one transaction with no error text and no coexist shutdown", async () => {
    const outcome = await providerAccountEventService.applyToTarget({
      request: request(),
      target: target(),
    })

    expect(outcome).toBe("apply")
    expect(mocks.applyProviderAccountEvent).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "offboarded",
      occurredAt: new Date("2026-11-04T10:00:00Z"),
      ownerId: "owner-1",
      lastError: undefined,
      callerTransaction: { tx: LEGACY_TX, pendingRelease: { current: null } },
    })
    expect(mocks.disableCoexist).not.toHaveBeenCalled()
  })

  test("a revoke takes the integration row (coexist off) before the connection row, in the same transaction", async () => {
    const order: string[] = []
    mocks.disableCoexist.mockImplementation(() => {
      order.push("coexist")
      return Promise.resolve(undefined)
    })
    mocks.applyProviderAccountEvent.mockImplementation(() => {
      order.push("connection")
      return Promise.resolve({ outcome: "apply" })
    })

    await providerAccountEventService.applyToTarget({
      request: request({
        event: "revoked",
        detail: { reason: "COMPANION_INACTIVITY", initiatedBy: "BUSINESS" },
      }),
      target: target(),
    })

    expect(order).toEqual(["coexist", "connection"])
    const { lastError } = appliedInput()
    expect(lastError).toContain("COMPANION_INACTIVITY")
    expect(mocks.disableCoexist).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-1",
      channel: "whatsapp",
      currentError: lastError,
      tx: LEGACY_TX,
    })
  })

  test("quota is released only after the transaction has committed", async () => {
    const order: string[] = []
    vi.mocked(db.transaction).mockImplementation((async (
      fn: (tx: unknown) => unknown,
    ) => {
      const result = await fn(LEGACY_TX)
      order.push("commit")
      return result
    }) as typeof db.transaction)
    mocks.releasePendingQuota.mockImplementation(() => {
      order.push("release")
      return Promise.resolve()
    })

    await providerAccountEventService.applyToTarget({
      request: request({ event: "revoked" }),
      target: target(),
    })

    expect(order).toEqual(["commit", "release"])
  })

  test("a duplicate revoke repeats the idempotent coexist shutdown and commits", async () => {
    mocks.applyProviderAccountEvent.mockResolvedValue({ outcome: "duplicate" })

    const outcome = await providerAccountEventService.applyToTarget({
      request: request({ event: "revoked" }),
      target: target(),
    })

    expect(outcome).toBe("duplicate")
    expect(mocks.disableCoexist).toHaveBeenCalledOnce()
  })

  test("a stale revoke rolls the whole transaction back, including the coexist shutdown", async () => {
    mocks.applyProviderAccountEvent.mockResolvedValue({ outcome: "stale" })
    let rolledBack = false
    vi.mocked(db.transaction).mockImplementation((async (
      fn: (tx: unknown) => unknown,
    ) => {
      try {
        return await fn(LEGACY_TX)
      } catch (error) {
        rolledBack = true
        throw error
      }
    }) as typeof db.transaction)

    const outcome = await providerAccountEventService.applyToTarget({
      request: request({ event: "revoked" }),
      target: target(),
    })

    expect(outcome).toBe("stale")
    expect(rolledBack).toBe(true)
  })

  test("a revoke on a channel without coexist records the error but shuts nothing down", async () => {
    await providerAccountEventService.applyToTarget({
      request: request({ event: "revoked", integrationType: "telegram" }),
      target: target(),
    })

    expect(appliedInput().lastError).toContain("Provider removed access")
    expect(mocks.disableCoexist).not.toHaveBeenCalled()
  })

  test("a failing coexist shutdown fails the whole revoke so nothing is half applied", async () => {
    mocks.disableCoexist.mockRejectedValue(new Error("disable failed"))

    await expect(
      providerAccountEventService.applyToTarget({
        request: request({ event: "revoked" }),
        target: target(),
      }),
    ).rejects.toThrow("disable failed")
    expect(mocks.applyProviderAccountEvent).not.toHaveBeenCalled()
    expect(mocks.releasePendingQuota).not.toHaveBeenCalled()
  })

  test("a failure while applying propagates so the job retries", async () => {
    mocks.applyProviderAccountEvent.mockRejectedValue(new Error("db down"))

    await expect(
      providerAccountEventService.applyToTarget({
        request: request(),
        target: target(),
      }),
    ).rejects.toThrow("db down")
    expect(mocks.releasePendingQuota).not.toHaveBeenCalled()
  })
})

describe("providerAccountEventService.applyToTarget — row without a Connection", () => {
  test("a revoke marks the inbox unhealthy and stops the coexist run in one transaction", async () => {
    const outcome = await providerAccountEventService.applyToTarget({
      request: request({ event: "revoked" }),
      target: target({ connectionId: null }),
    })

    expect(outcome).toBe("legacyRevoked")
    // Integration row before inbox row, the order a reconnect takes them in.
    expect(mocks.disableCoexist.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markLegacyInboxUnhealthy.mock.invocationCallOrder[0] ?? 0,
    )
    expect(mocks.markLegacyInboxUnhealthy).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      reason: "provider_revoked",
      tx: LEGACY_TX,
    })
    expect(mocks.disableCoexist).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "int-1",
        channel: "whatsapp",
        tx: LEGACY_TX,
      }),
    )
    expect(mocks.applyProviderAccountEvent).not.toHaveBeenCalled()
  })

  test("a failing teardown fails the whole revoke so it retries", async () => {
    mocks.disableCoexist.mockRejectedValue(new Error("teardown failed"))

    await expect(
      providerAccountEventService.applyToTarget({
        request: request({ event: "revoked" }),
        target: target({ connectionId: null }),
      }),
    ).rejects.toThrow("teardown failed")
  })

  test.each([
    "offboarded",
    "reconnected",
  ] as const)("%s is ignored", async (event) => {
    const outcome = await providerAccountEventService.applyToTarget({
      request: request({ event }),
      target: target({ connectionId: null }),
    })

    expect(outcome).toBe("legacyIgnored")
    expect(mocks.markLegacyInboxUnhealthy).not.toHaveBeenCalled()
    expect(mocks.disableCoexist).not.toHaveBeenCalled()
  })
})
