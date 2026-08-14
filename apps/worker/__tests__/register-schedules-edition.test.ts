import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUpsertJobScheduler, mockRemoveJobScheduler, envState } = vi.hoisted(
  () => ({
    mockUpsertJobScheduler: vi.fn(async () => undefined),
    mockRemoveJobScheduler: vi.fn(async () => undefined),
    envState: {
      NEXT_PUBLIC_EDITION: "community",
      QUOTA_SYNC_INTERVAL_SECONDS: 60,
    },
  }),
)

class FakeQueue {
  upsertJobScheduler = mockUpsertJobScheduler
  removeJobScheduler = mockRemoveJobScheduler
}

vi.mock("bullmq", () => ({ Queue: FakeQueue }))

vi.mock("@chatbotx.io/worker-config", () => ({
  PURGE_WORKSPACES_INTERVAL_MINUTES: 10,
  ScheduleJobData: {
    enqueueBroadcast: "enqueueBroadcast",
    finalizeBroadcasts: "finalizeBroadcasts",
    reconcileBroadcasts: "reconcileBroadcasts",
    evaluateTriggers: "evaluateTriggers",
    cleanupTriggers: "cleanupTriggers",
    evaluateDateTimeWebhooks: "evaluateDateTimeWebhooks",
    cleanupWebhookExecutions: "cleanupWebhookExecutions",
    scanSmartDelay: "scanSmartDelay",
    syncUserQuota: "syncUserQuota",
    reconcileTenants: "reconcileTenants",
    maintainMacPartitions: "maintainMacPartitions",
    scanCoexistRuns: "scanCoexistRuns",
    reconcileMetaCatalogSyncs: "reconcileMetaCatalogSyncs",
    purgeCoexistStaging: "purgeCoexistStaging",
    purgeWhatsappSignupSessions: "purgeWhatsappSignupSessions",
    purgeWorkspaces: "purgeWorkspaces",
    refreshChannelTokens: "refreshChannelTokens",
    unsubscribeExpiredTrials: "unsubscribeExpiredTrials",
  },
  scheduleQueue: new FakeQueue(),
}))

vi.mock("../src/env", () => ({ env: envState }))

const { registerSchedules } = await import(
  "../src/schedule/handlers/register-schedules"
)

const CLOUD_ONLY = [
  "syncUserQuota",
  "reconcileTenants",
  "unsubscribeExpiredTrials",
]

const upsertedNames = () =>
  mockUpsertJobScheduler.mock.calls.map((call) => call[0] as string)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("registerSchedules — edition gating", () => {
  test("cloud registers the quota/trial schedulers and removes none", async () => {
    envState.NEXT_PUBLIC_EDITION = "cloud"

    await registerSchedules()

    const names = upsertedNames()
    for (const name of CLOUD_ONLY) {
      expect(names).toContain(name)
    }
    expect(mockRemoveJobScheduler).not.toHaveBeenCalled()
  })

  test.each([
    "community",
    "enterprise",
  ])("%s skips the cloud-only schedulers and removes persisted ones", async (edition) => {
    envState.NEXT_PUBLIC_EDITION = edition

    await registerSchedules()

    const names = upsertedNames()
    for (const name of CLOUD_ONLY) {
      expect(names).not.toContain(name)
    }
    expect(mockRemoveJobScheduler).toHaveBeenCalledTimes(CLOUD_ONLY.length)
    for (const name of CLOUD_ONLY) {
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith(name)
    }
  })

  test("all-edition schedulers register regardless of edition", async () => {
    envState.NEXT_PUBLIC_EDITION = "community"

    await registerSchedules()

    const names = upsertedNames()
    expect(names).toContain("purgeWorkspaces")
    expect(names).toContain("maintainMacPartitions")
    expect(names).toContain("enqueueBroadcast")
  })
})
