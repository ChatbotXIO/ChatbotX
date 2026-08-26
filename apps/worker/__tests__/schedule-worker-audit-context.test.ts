import { getAuditActor } from "@chatbotx.io/business/audit"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureBootstrapped: vi.fn(),
  processJob: undefined as undefined | ((job: unknown) => Promise<void>),
  teardownExpiredTrial: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    ScheduleJobData: {
      enqueueBroadcast: "enqueueBroadcast",
      prepareBroadcast: "prepareBroadcast",
      sendBroadcast: "sendBroadcast",
      finalizeBroadcasts: "finalizeBroadcasts",
      reconcileBroadcasts: "reconcileBroadcasts",
      evaluateTriggers: "evaluateTriggers",
      cleanupTriggers: "cleanupTriggers",
      evaluateDateTimeWebhooks: "evaluateDateTimeWebhooks",
      cleanupWebhookExecutions: "cleanupWebhookExecutions",
      scanSmartDelay: "scanSmartDelay",
      scanAppointmentReminders: "scanAppointmentReminders",
      syncUserQuota: "syncUserQuota",
      reconcileTenants: "reconcileTenants",
      maintainMacPartitions: "maintainMacPartitions",
      scanCoexistRuns: "scanCoexistRuns",
      reconcileMetaCatalogSyncs: "reconcileMetaCatalogSyncs",
      purgeCoexistStaging: "purgeCoexistStaging",
      purgeWhatsappSignupSessions: "purgeWhatsappSignupSessions",
      purgeWorkspaces: "purgeWorkspaces",
      purgeAutomationThrottle: "purgeAutomationThrottle",
      refreshChannelTokens: "refreshChannelTokens",
      unsubscribeExpiredTrials: "unsubscribeExpiredTrials",
      teardownExpiredTrial: "teardownExpiredTrial",
    },
    defaultWorkerOptions: {},
    getRedisConnection: vi.fn(),
    queueNames: { enum: { schedule: "schedule" } },
    scheduleQueue: {},
  }
})

vi.mock("bullmq", () => ({
  Worker: class Worker {
    constructor(_queue: string, processJob: (job: unknown) => Promise<void>) {
      mocks.processJob = processJob
    }

    on() {
      // Worker event registration is not exercised by this unit test.
    }

    close() {
      return Promise.resolve()
    }
  },
  Queue: class Queue {},
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: mocks.ensureBootstrapped,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/trigger/datetime-trigger-scanner", () => ({
  cleanupTriggerExecutions: vi.fn(),
  scanDateTimeTriggers: vi.fn(),
}))
vi.mock("../src/webhook/datetime-webhook-scanner", () => ({
  cleanupWebhookExecutions: vi.fn(),
  scanDateTimeWebhooks: vi.fn(),
}))
vi.mock("../src/schedule/handlers/enqueue-broadcast", () => ({
  enqueueBroadcast: vi.fn(),
}))
vi.mock("../src/schedule/handlers/finalize-broadcasts", () => ({
  finalizeBroadcasts: vi.fn(),
}))
vi.mock("../src/schedule/handlers/maintain-mac-partitions", () => ({
  maintainMacPartitions: vi.fn(),
}))
vi.mock("../src/schedule/handlers/prepare-broadcast", () => ({
  prepareBroadcast: vi.fn(),
}))
vi.mock("../src/schedule/handlers/process-broadcast-contacts", () => ({
  processBroadcastContacts: vi.fn(),
}))
vi.mock("../src/schedule/handlers/purge-automation-throttle", () => ({
  purgeAutomationThrottle: vi.fn(),
}))
vi.mock("../src/schedule/handlers/purge-coexist-staging", () => ({
  purgeCoexistStaging: vi.fn(),
}))
vi.mock("../src/schedule/handlers/purge-whatsapp-signup-sessions", () => ({
  purgeWhatsappSignupSessions: vi.fn(),
}))
vi.mock("../src/schedule/handlers/purge-workspaces", () => ({
  purgeWorkspaces: vi.fn(),
}))
vi.mock("../src/schedule/handlers/reconcile-broadcasts", () => ({
  reconcileBroadcasts: vi.fn(),
}))
vi.mock("../src/schedule/handlers/reconcile-meta-catalog-syncs", () => ({
  reconcileMetaCatalogSyncs: vi.fn(),
}))
vi.mock("../src/schedule/handlers/reconcile-tenants", () => ({
  reconcileTenants: vi.fn(),
}))
vi.mock("../src/schedule/handlers/refresh-channel-tokens", () => ({
  refreshChannelTokens: vi.fn(),
}))
vi.mock("../src/schedule/handlers/register-schedules", () => ({
  registerSchedules: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../src/schedule/handlers/scan-appointment-reminders", () => ({
  scanAppointmentReminders: vi.fn(),
}))
vi.mock("../src/schedule/handlers/scan-coexist-runs", () => ({
  scanCoexistRuns: vi.fn(),
}))
vi.mock("../src/schedule/handlers/scan-smart-delay", () => ({
  scanSmartDelay: vi.fn(),
}))
vi.mock("../src/schedule/handlers/sync-user-quota", () => ({
  syncUserQuota: vi.fn(),
}))
vi.mock("../src/schedule/handlers/teardown-expired-trial", () => ({
  teardownExpiredTrial: (...args: unknown[]) =>
    mocks.teardownExpiredTrial(...args),
}))
vi.mock("../src/schedule/handlers/unsubscribe-expired-trials", () => ({
  unsubscribeExpiredTrials: vi.fn(),
}))

beforeAll(async () => {
  mocks.ensureBootstrapped.mockResolvedValue(undefined)
  await import("../src/schedule/worker")
  await vi.waitFor(() => expect(mocks.processJob).toBeTypeOf("function"))
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("schedule worker audit context", () => {
  test("populates the audit actor with the cron job source (no workspace on the payload)", async () => {
    let capturedActor: ReturnType<typeof getAuditActor>
    mocks.teardownExpiredTrial.mockImplementationOnce(() => {
      capturedActor = getAuditActor()
    })

    await mocks.processJob?.({
      id: "job-1",
      data: { type: "teardownExpiredTrial", data: { userId: "user-1" } },
    })

    expect(capturedActor).toEqual(
      expect.objectContaining({ source: "schedule:teardownExpiredTrial" }),
    )
    expect(mocks.teardownExpiredTrial).toHaveBeenCalledWith("user-1")
  })
})
