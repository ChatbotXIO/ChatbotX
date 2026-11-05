// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listQueuedBefore: vi.fn(),
  listQueuedForInstallation: vi.fn(),
  markProcessingRunFailed: vi.fn(),
  addInstallationWarning: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateAiFileDispatchRepository: {
    listQueuedBefore: mocks.listQueuedBefore,
    listQueuedForInstallation: mocks.listQueuedForInstallation,
  },
  templateUninstallStateRepository: {
    addInstallationWarning: mocks.addInstallationWarning,
  },
}))
vi.mock("../src/ai-file/service", () => ({
  aiFileService: { markProcessingRunFailed: mocks.markProcessingRunFailed },
}))

const {
  templateAiFileDispatchService,
  TEMPLATE_AI_FILE_MAX_QUEUED_MS,
  TEMPLATE_AI_FILE_REDISPATCH_AFTER_MS,
} = await import("../src/template/ai-file-dispatch.service")

const NOW = Date.parse("2026-10-30T12:00:00.000Z")
const queued = (id: string, ageMs: number) => ({
  installationId: `inst-${id}`,
  aiFileId: id,
  workspaceId: "ws-1",
  runId: `run-${id}`,
  queuedAt: new Date(NOW - ageMs).toISOString(),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.markProcessingRunFailed.mockResolvedValue(true)
})

describe("templateAiFileDispatchService.listForSweep", () => {
  test("asks only for runs queued longer than the redispatch delay", async () => {
    mocks.listQueuedBefore.mockResolvedValue([])

    await templateAiFileDispatchService.listForSweep(NOW)

    expect(mocks.listQueuedBefore).toHaveBeenCalledWith({
      queuedBefore: new Date(NOW - TEMPLATE_AI_FILE_REDISPATCH_AFTER_MS),
      limit: 500,
    })
  })

  test("re-enqueues recent runs and gives up on the ones queued past the age limit", async () => {
    mocks.listQueuedBefore.mockResolvedValue([
      queued("fresh", 30 * 60 * 1000),
      queued("old", TEMPLATE_AI_FILE_MAX_QUEUED_MS + 1000),
    ])

    const result = await templateAiFileDispatchService.listForSweep(NOW)

    expect(result.redispatch.map((file) => file.aiFileId)).toEqual(["fresh"])
    expect(result.expired).toBe(1)
    expect(mocks.markProcessingRunFailed).toHaveBeenCalledTimes(1)
    expect(mocks.markProcessingRunFailed).toHaveBeenCalledWith({
      aiFileId: "old",
      workspaceId: "ws-1",
      runId: "run-old",
      code: "enqueueFailed",
    })
  })

  test("warns the installation when it gives up on an AI file", async () => {
    mocks.listQueuedBefore.mockResolvedValue([
      queued("old", TEMPLATE_AI_FILE_MAX_QUEUED_MS + 1000),
    ])

    await templateAiFileDispatchService.listForSweep(NOW)

    expect(mocks.addInstallationWarning).toHaveBeenCalledWith({
      installationId: "inst-old",
      warning: {
        category: "aiFiles",
        entityKind: "enqueueFailed",
        path: "aiFile.old",
        value: "old",
      },
    })
  })

  test("does not count a run another worker already finished", async () => {
    mocks.listQueuedBefore.mockResolvedValue([
      queued("old", TEMPLATE_AI_FILE_MAX_QUEUED_MS + 1000),
    ])
    mocks.markProcessingRunFailed.mockResolvedValue(false)

    const result = await templateAiFileDispatchService.listForSweep(NOW)

    expect(result.expired).toBe(0)
    expect(mocks.addInstallationWarning).not.toHaveBeenCalled()
  })
})

describe("templateAiFileDispatchService.listQueuedForInstallation", () => {
  test("lists the queued runs of one installation", async () => {
    mocks.listQueuedForInstallation.mockResolvedValue([queued("a", 0)])

    await expect(
      templateAiFileDispatchService.listQueuedForInstallation("inst-1"),
    ).resolves.toHaveLength(1)
    expect(mocks.listQueuedForInstallation).toHaveBeenCalledWith("inst-1")
  })
})
