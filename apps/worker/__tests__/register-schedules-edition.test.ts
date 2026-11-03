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
  PURGE_BROADCASTS_INTERVAL_MINUTES: 5,
  ScheduleJobData: {
    scanAbandonedCarts: "scanAbandonedCarts",
    expireUnpaidOrders: "expireUnpaidOrders",
    dispatchProfileSnapshots: "dispatchProfileSnapshots",
    enqueueRecurringBroadcasts: "enqueueRecurringBroadcasts",
    enqueueMarketingMessages: "enqueueMarketingMessages",
    dispatchMarketingMessages: "dispatchMarketingMessages",
    finalizeMarketingMessages: "finalizeMarketingMessages",
    scanContactScans: "scanContactScans",
    scanAiHandoverBulkRuns: "scanAiHandoverBulkRuns",
    clearExpiredSupportAccess: "clearExpiredSupportAccess",
    purgeCommentAutomationEvents: "purgeCommentAutomationEvents",
    purgeErrorLogs: "purgeErrorLogs",
    purgeExpiredCallRecordings: "purgeExpiredCallRecordings",
    purgeExpiredContactExports: "purgeExpiredContactExports",
    purgeInboundWebhookRequests: "purgeInboundWebhookRequests",
    redispatchInboundWebhookRequests: "redispatchInboundWebhookRequests",
    scanAppointmentReminders: "scanAppointmentReminders",
    sweepStaleWhatsappCalls: "sweepStaleWhatsappCalls",
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
    maintainLeaderboardPartitions: "maintainLeaderboardPartitions",
    finishOverdueLeaderboards: "finishOverdueLeaderboards",
    maintainLeaderboardRankings: "maintainLeaderboardRankings",
    scanCoexistRuns: "scanCoexistRuns",
    reconcileMetaCatalogSyncs: "reconcileMetaCatalogSyncs",
    purgeCoexistStaging: "purgeCoexistStaging",
    purgeWhatsappSignupSessions: "purgeWhatsappSignupSessions",
    purgeExpiredConnectSessions: "purgeExpiredConnectSessions",
    purgeWorkspaces: "purgeWorkspaces",
    purgeExpiredOAuthTokens: "purgeExpiredOAuthTokens",
    purgeBroadcasts: "purgeBroadcasts",
    purgeAutomationThrottle: "purgeAutomationThrottle",
    refreshChannelTokens: "refreshChannelTokens",
    refreshLicense: "refreshLicense",
    unsubscribeExpiredTrials: "unsubscribeExpiredTrials",
    googleAdsHousekeeping: "googleAdsHousekeeping",
    googleAdsSyncSetups: "googleAdsSyncSetups",
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

const HOURLY_CRON_PATTERN = /^\d{1,2} \* \* \* \*$/
// "* * * * *" or its seconds-first form "N * * * * *"; group 1 is the second.
const EVERY_MINUTE_PATTERN = /^(?:(\d{1,2}) )?\* \* \* \* \*$/

const upsertedNames = () =>
  mockUpsertJobScheduler.mock.calls.map((call) => call[0] as string)

const upsertedRepeatOptionsFor = (name: string) =>
  mockUpsertJobScheduler.mock.calls.find((call) => call[0] === name)?.[1] as
    | { pattern?: string; every?: number }
    | undefined

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
    expect(names).toContain("refreshLicense")
    expect(upsertedRepeatOptionsFor("refreshLicense")?.pattern).toMatch(
      HOURLY_CRON_PATTERN,
    )
  })

  test("community removes all persisted cloud and license schedulers", async () => {
    envState.NEXT_PUBLIC_EDITION = "community"

    await registerSchedules()

    const names = upsertedNames()
    for (const name of CLOUD_ONLY) {
      expect(names).not.toContain(name)
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith(name)
    }
    expect(names).not.toContain("refreshLicense")
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("refreshLicense")
    expect(mockRemoveJobScheduler).toHaveBeenCalledTimes(CLOUD_ONLY.length + 1)
  })

  test("enterprise registers the license scheduler and removes cloud-only schedulers", async () => {
    envState.NEXT_PUBLIC_EDITION = "enterprise"

    await registerSchedules()

    const names = upsertedNames()
    for (const name of CLOUD_ONLY) {
      expect(names).not.toContain(name)
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith(name)
    }
    expect(names).toContain("refreshLicense")
    expect(upsertedRepeatOptionsFor("refreshLicense")?.pattern).toMatch(
      HOURLY_CRON_PATTERN,
    )
    expect(mockRemoveJobScheduler).toHaveBeenCalledTimes(CLOUD_ONLY.length)
  })

  test("all-edition schedulers register regardless of edition", async () => {
    envState.NEXT_PUBLIC_EDITION = "community"

    await registerSchedules()

    const names = upsertedNames()
    expect(names).toContain("purgeWorkspaces")
    expect(names).toContain("purgeExpiredOAuthTokens")
    expect(names).toContain("purgeBroadcasts")
    expect(names).toContain("maintainMacPartitions")
    expect(names).toContain("maintainLeaderboardPartitions")
    expect(names).toContain("finishOverdueLeaderboards")
    expect(names).toContain("maintainLeaderboardRankings")
    expect(names).toContain("enqueueBroadcast")
    expect(names).toContain("purgeExpiredConnectSessions")
    expect(names).toContain("googleAdsHousekeeping")
    expect(names).toContain("googleAdsSyncSetups")
  })

  test("google ads crons run every 10 minutes and daily at 03:30", async () => {
    envState.NEXT_PUBLIC_EDITION = "community"

    await registerSchedules()

    expect(upsertedRepeatOptionsFor("googleAdsHousekeeping")?.pattern).toBe(
      "*/10 * * * *",
    )
    expect(upsertedRepeatOptionsFor("googleAdsSyncSetups")?.pattern).toBe(
      "30 3 * * *",
    )
    const call = mockUpsertJobScheduler.mock.calls.find(
      (c) => c[0] === "googleAdsHousekeeping",
    )
    expect(call?.[2]).toEqual({
      name: "googleAdsHousekeeping",
      data: { type: "googleAdsHousekeeping", data: {} },
    })
  })

  // Derived-const typo protection: the cron pattern must actually track
  // PURGE_BROADCASTS_INTERVAL_MINUTES (mocked as 5 above), not a hardcoded
  // literal that could silently drift from it.
  test("purgeBroadcasts registers with a pattern derived from PURGE_BROADCASTS_INTERVAL_MINUTES", async () => {
    envState.NEXT_PUBLIC_EDITION = "community"

    await registerSchedules()

    expect(upsertedRepeatOptionsFor("purgeBroadcasts")?.pattern).toBe(
      "*/5 * * * *",
    )
  })
})

describe("registerSchedules — every-minute cadence", () => {
  // These read the minute boundary (`startOfMinute`) or start user-scheduled
  // sends, so they must keep firing exactly at :00.
  const ON_THE_MINUTE = [
    "enqueueBroadcast",
    "enqueueRecurringBroadcasts",
    "enqueueMarketingMessages",
    "evaluateTriggers",
    "evaluateDateTimeWebhooks",
  ]
  // Scanners and finalizers with no wall-clock dependency: spread over the minute.
  const SPREAD_OVER_THE_MINUTE = [
    "expireUnpaidOrders",
    "finishOverdueLeaderboards",
    "dispatchMarketingMessages",
    "scanAbandonedCarts",
    "reconcileBroadcasts",
    "dispatchProfileSnapshots",
    "scanCoexistRuns",
    "scanContactScans",
    "scanAiHandoverBulkRuns",
    "finalizeBroadcasts",
    "finalizeMarketingMessages",
    "reconcileMetaCatalogSyncs",
  ]

  const everyMinuteJobNames = () =>
    mockUpsertJobScheduler.mock.calls.flatMap((call) =>
      EVERY_MINUTE_PATTERN.test((call[1] as { pattern?: string }).pattern ?? "")
        ? [call[0] as string]
        : [],
    )

  test("keeps the minute-boundary jobs at second :00", async () => {
    envState.NEXT_PUBLIC_EDITION = "community"

    await registerSchedules()

    for (const name of ON_THE_MINUTE) {
      expect(upsertedRepeatOptionsFor(name)?.pattern).toBe("* * * * *")
    }
  })

  test("moves every spread job to its own second between :01 and :59", async () => {
    envState.NEXT_PUBLIC_EDITION = "community"

    await registerSchedules()

    const seconds = SPREAD_OVER_THE_MINUTE.map((name) => {
      const match = EVERY_MINUTE_PATTERN.exec(
        upsertedRepeatOptionsFor(name)?.pattern ?? "",
      )
      return Number(match?.[1])
    })

    for (const second of seconds) {
      expect(Number.isInteger(second)).toBe(true)
      expect(second).toBeGreaterThanOrEqual(1)
      expect(second).toBeLessThanOrEqual(59)
    }
    expect(new Set(seconds).size).toBe(SPREAD_OVER_THE_MINUTE.length)
  })

  // A new every-minute job must be classified on purpose, not land on :00 (or
  // anywhere) by default.
  test("registers no every-minute job outside the two classified groups", async () => {
    envState.NEXT_PUBLIC_EDITION = "community"

    await registerSchedules()

    // Sorted equality with the two (duplicate-free) lists also fails if a job
    // is upserted twice.
    expect(everyMinuteJobNames().sort()).toEqual(
      [...ON_THE_MINUTE, ...SPREAD_OVER_THE_MINUTE].sort(),
    )
  })
})
