import { PROVIDER_ACCOUNT_TARGET_BATCH_SIZE } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAccountTargets: vi.fn(),
  applyToTarget: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (workspaceId: string | undefined, fn: () => Promise<void>) =>
      workspaceId === "ws-frozen" ? undefined : await fn(),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: { listAccountTargets: mocks.listAccountTargets },
  providerAccountEventService: { applyToTarget: mocks.applyToTarget },
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))
vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: (_ctx: unknown, fn: () => Promise<void>) => fn(),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { handleProviderAccountEvent } = await import(
  "../src/integration/handlers/provider-account-event"
)

const OCCURRED_AT = 1_800_000_000_000

const jobData = (
  overrides: Partial<Parameters<typeof handleProviderAccountEvent>[0]> = {},
): Parameters<typeof handleProviderAccountEvent>[0] => ({
  integrationType: "whatsapp",
  account: { kind: "businessAccount", id: "waba-1" },
  event: "offboarded",
  detail: { reason: "unknown", initiatedBy: "unknown" },
  occurredAt: OCCURRED_AT,
  routeScope: { kind: "platform", appId: "app-1" },
  ...overrides,
})

const target = (overrides: Record<string, unknown> = {}) => ({
  integrationId: "int-1",
  workspaceId: "ws-1",
  workspaceOwnerId: "owner-1",
  inboxId: "inbox-1",
  connectionId: "conn-1",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listAccountTargets.mockResolvedValue([target()])
  mocks.applyToTarget.mockResolvedValue("apply")
})

describe("handleProviderAccountEvent", () => {
  test("drops a job that carries no route scope", async () => {
    await handleProviderAccountEvent(jobData({ routeScope: undefined }))

    expect(mocks.listAccountTargets).not.toHaveBeenCalled()
    expect(mocks.applyToTarget).not.toHaveBeenCalled()
  })

  test("drops an integration type that has no target loader", async () => {
    await handleProviderAccountEvent(jobData({ integrationType: "telegram" }))

    expect(mocks.listAccountTargets).not.toHaveBeenCalled()
  })

  test("loads targets with the WABA id and the route scope", async () => {
    const routeScope = {
      kind: "credentialOwner",
      ownerId: "owner-1",
      appId: "app-1",
    } as const

    await handleProviderAccountEvent(jobData({ routeScope }))

    expect(mocks.listAccountTargets).toHaveBeenCalledWith({
      wabaId: "waba-1",
      scope: routeScope,
      afterIntegrationId: undefined,
    })
  })

  test("hands every target and the event to the business service", async () => {
    mocks.listAccountTargets.mockResolvedValue([
      target(),
      target({ integrationId: "int-2", connectionId: "conn-2" }),
    ])

    await handleProviderAccountEvent(jobData())

    expect(mocks.applyToTarget).toHaveBeenCalledTimes(2)
    expect(mocks.applyToTarget).toHaveBeenCalledWith({
      request: {
        integrationType: "whatsapp",
        event: "offboarded",
        detail: { reason: "unknown", initiatedBy: "unknown" },
        occurredAt: new Date(OCCURRED_AT),
      },
      target: expect.objectContaining({ connectionId: "conn-1" }),
    })
  })

  test("keeps paging until a short batch, so no number is left behind", async () => {
    const fullBatch = Array.from(
      { length: PROVIDER_ACCOUNT_TARGET_BATCH_SIZE },
      (_, index) => target({ integrationId: `int-${index}` }),
    )
    mocks.listAccountTargets
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([target({ integrationId: "int-last" })])

    await handleProviderAccountEvent(jobData())

    expect(mocks.listAccountTargets).toHaveBeenCalledTimes(2)
    expect(mocks.listAccountTargets).toHaveBeenLastCalledWith(
      expect.objectContaining({
        afterIntegrationId: `int-${PROVIDER_ACCOUNT_TARGET_BATCH_SIZE - 1}`,
      }),
    )
    expect(mocks.applyToTarget).toHaveBeenCalledTimes(
      PROVIDER_ACCOUNT_TARGET_BATCH_SIZE + 1,
    )
  })

  test("a frozen workspace is skipped while the rest of the account is handled", async () => {
    mocks.listAccountTargets.mockResolvedValue([
      target({ workspaceId: "ws-frozen", connectionId: "conn-frozen" }),
      target(),
    ])

    await handleProviderAccountEvent(jobData())

    expect(mocks.applyToTarget).toHaveBeenCalledTimes(1)
    expect(mocks.applyToTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ connectionId: "conn-1" }),
      }),
    )
  })

  test("no matching numbers is a quiet no-op", async () => {
    mocks.listAccountTargets.mockResolvedValue([])

    await handleProviderAccountEvent(jobData())

    expect(mocks.applyToTarget).not.toHaveBeenCalled()
  })

  test("a failure on one number propagates so the job retries", async () => {
    mocks.applyToTarget.mockRejectedValue(new Error("db down"))

    await expect(handleProviderAccountEvent(jobData())).rejects.toThrow(
      "db down",
    )
  })
})
