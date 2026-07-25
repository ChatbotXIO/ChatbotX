import type { DefaultJobData } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

type DefaultWorkerJob = {
  attemptsMade: number
  data: DefaultJobData
  id: string
  name: string
}

type DefaultWorkerProcessor = (job: DefaultWorkerJob) => Promise<void>

const workerState = vi.hoisted(() => ({
  defaultQueueAdd: vi.fn(),
  handleBulkTagContacts: vi.fn(),
  isBlockedWorkspace: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  processor: undefined as DefaultWorkerProcessor | undefined,
  resolveWorkspaceId: vi.fn(),
  workerClose: vi.fn(async () => undefined),
  workerOn: vi.fn(),
}))

vi.mock("bullmq", () => {
  class WorkerMock {
    close = workerState.workerClose
    on = workerState.workerOn

    constructor(
      _queueName: unknown,
      processor: DefaultWorkerProcessor,
      _options: unknown,
    ) {
      workerState.processor = processor
    }
  }

  return {
    Worker: WorkerMock,
  }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    bulkTagContacts: "bulkTagContacts",
    exportContacts: "exportContacts",
    runImport: "runImport",
    sendAuditLog: "sendAuditLog",
    sendErrorLog: "sendErrorLog",
    syncChannelLabels: "syncChannelLabels",
    syncTag: "syncTag",
  },
  defaultQueue: {
    add: (...args: unknown[]) => workerState.defaultQueueAdd(...args),
  },
  defaultWorkerOptions: {},
  getRedisConnection: () => ({}),
  queueNames: {
    enum: {
      default: "default",
    },
  },
}))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: (workspaceId: string | undefined) =>
    workerState.isBlockedWorkspace(workspaceId),
}))

vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: (data: unknown) => workerState.resolveWorkspaceId(data),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => workerState.loggerError(...args),
    info: (...args: unknown[]) => workerState.loggerInfo(...args),
    warn: (...args: unknown[]) => workerState.loggerWarn(...args),
  },
}))

vi.mock("../src/default/handlers/bulk-tag-contacts", () => ({
  handleBulkTagContacts: (...args: unknown[]) =>
    workerState.handleBulkTagContacts(...args),
}))

vi.mock("../src/default/handlers/export-contacts", () => ({
  loopableExportContacts: vi.fn(),
}))

vi.mock("../src/default/handlers/run-import", () => ({
  runImport: vi.fn(),
}))

vi.mock("../src/default/handlers/send-audit-log", () => ({
  sendAuditLog: vi.fn(),
}))

vi.mock("../src/default/handlers/send-error-log", () => ({
  sendErrorLog: vi.fn(),
}))

vi.mock("../src/default/handlers/sync-channel-labels", () => ({
  handleSyncChannelLabels: vi.fn(),
}))

vi.mock("../src/default/handlers/sync-tag", () => ({
  handleSyncTag: vi.fn(),
}))

await import("../src/default/worker")

const buildBulkTagContactsJob = (): DefaultJobData => ({
  type: "bulkTagContacts",
  data: {
    broadcastId: "broadcast-1",
    eventType: "message:sent",
    excludedContactIds: [],
    requestedUserId: "user-1",
    source: "broadcast",
    tagIds: ["tag-1"],
    workspaceId: "workspace-1",
  },
})

const processDefaultJob = async (
  data: DefaultJobData,
  attemptsMade = 0,
): Promise<void> => {
  if (!workerState.processor) {
    throw new Error("Default worker processor was not captured")
  }

  await workerState.processor({
    attemptsMade,
    data,
    id: "job-1",
    name: data.type,
  })
}

beforeEach(() => {
  workerState.defaultQueueAdd.mockReset()
  workerState.handleBulkTagContacts.mockReset()
  workerState.isBlockedWorkspace.mockReset()
  workerState.loggerError.mockReset()
  workerState.loggerInfo.mockReset()
  workerState.loggerWarn.mockReset()
  workerState.resolveWorkspaceId.mockReset()
  workerState.resolveWorkspaceId.mockResolvedValue("workspace-1")
  workerState.isBlockedWorkspace.mockResolvedValue(false)
})

describe("default worker", () => {
  test("skips bulk tag contact jobs for frozen workspaces", async () => {
    workerState.isBlockedWorkspace.mockResolvedValue(true)

    const jobData = buildBulkTagContactsJob()
    await processDefaultJob(jobData)

    expect(workerState.resolveWorkspaceId).toHaveBeenCalledWith(jobData.data)
    expect(workerState.isBlockedWorkspace).toHaveBeenCalledWith("workspace-1")
    expect(workerState.handleBulkTagContacts).not.toHaveBeenCalled()
  })

  test("runs bulk tag contact jobs for active workspaces", async () => {
    const jobData = buildBulkTagContactsJob()

    await processDefaultJob(jobData, 2)

    expect(workerState.resolveWorkspaceId).toHaveBeenCalledWith(jobData.data)
    expect(workerState.isBlockedWorkspace).toHaveBeenCalledWith("workspace-1")
    expect(workerState.handleBulkTagContacts).toHaveBeenCalledWith(
      jobData.data,
      { attemptsMade: 2 },
    )
  })
})
