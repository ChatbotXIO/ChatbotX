import type { AdsConversionJobData } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const UNHANDLED_JOB_TYPE_ERROR = /Unhandled ads conversion job type/

type AdsConversionWorkerJob = {
  id: string
  data: AdsConversionJobData
}

type AdsConversionWorkerProcessor = (
  job: AdsConversionWorkerJob,
) => Promise<void>

const workerState = vi.hoisted(() => ({
  handleEvaluateTemplateSent: vi.fn(),
  handleEvaluateConversionTrigger: vi.fn(),
  handleSendConversionEvent: vi.fn(),
  handleSyncRetargetAudience: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  processor: undefined as AdsConversionWorkerProcessor | undefined,
  workerClose: vi.fn(async () => undefined),
  workerOn: vi.fn(),
}))

vi.mock("bullmq", () => {
  class WorkerMock {
    close = workerState.workerClose
    on = workerState.workerOn

    constructor(
      _queueName: unknown,
      processor: AdsConversionWorkerProcessor,
      _options: unknown,
    ) {
      workerState.processor = processor
    }
  }

  return { Worker: WorkerMock }
})

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AdsConversionJobAction: {
    sendConversionEvent: "sendConversionEvent",
    evaluateTemplateSent: "evaluateTemplateSent",
    evaluateConversionTrigger: "evaluateConversionTrigger",
    syncRetargetAudience: "syncRetargetAudience",
  },
  defaultWorkerOptions: {},
  getRedisConnection: () => ({}),
  queueNames: {
    enum: {
      adsConversion: "adsConversion",
    },
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => workerState.loggerError(...args),
    info: (...args: unknown[]) => workerState.loggerInfo(...args),
    warn: (...args: unknown[]) => workerState.loggerWarn(...args),
  },
}))

vi.mock("../src/ads-conversion/handlers/evaluate-template-sent", () => ({
  handleEvaluateTemplateSent: (...args: unknown[]) =>
    workerState.handleEvaluateTemplateSent(...args),
}))

vi.mock("../src/ads-conversion/handlers/evaluate-conversion-trigger", () => ({
  handleEvaluateConversionTrigger: (...args: unknown[]) =>
    workerState.handleEvaluateConversionTrigger(...args),
}))

vi.mock("../src/ads-conversion/handlers/send-conversion-event", () => ({
  handleSendConversionEvent: (...args: unknown[]) =>
    workerState.handleSendConversionEvent(...args),
}))

vi.mock("../src/ads-conversion/handlers/sync-retarget-audience", () => ({
  handleSyncRetargetAudience: (...args: unknown[]) =>
    workerState.handleSyncRetargetAudience(...args),
}))

await import("../src/ads-conversion/worker")

const processAdsConversionJob = async (
  data: AdsConversionJobData,
): Promise<void> => {
  if (!workerState.processor) {
    throw new Error("Ads conversion worker processor was not captured")
  }

  await workerState.processor({ id: "job-1", data })
}

beforeEach(() => {
  workerState.handleEvaluateTemplateSent.mockReset()
  workerState.handleEvaluateConversionTrigger.mockReset()
  workerState.handleSendConversionEvent.mockReset()
  workerState.handleSyncRetargetAudience.mockReset()
  workerState.loggerError.mockReset()
  workerState.loggerInfo.mockReset()
  workerState.loggerWarn.mockReset()
})

describe("ads conversion worker dispatch", () => {
  test("routes evaluateTemplateSent jobs to their handler", async () => {
    const data: AdsConversionJobData = {
      type: "evaluateTemplateSent",
      data: {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        templateId: "template-1",
      },
    }

    await processAdsConversionJob(data)

    expect(workerState.handleEvaluateTemplateSent).toHaveBeenCalledWith(
      data.data,
    )
  })

  test("routes evaluateConversionTrigger jobs to their handler", async () => {
    const data: AdsConversionJobData = {
      type: "evaluateConversionTrigger",
      data: {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        occurrence: { type: "tagApplied", tagId: "tag-1" },
      },
    }

    await processAdsConversionJob(data)

    expect(workerState.handleEvaluateConversionTrigger).toHaveBeenCalledWith(
      data.data,
    )
  })

  test("routes sendConversionEvent jobs to their handler", async () => {
    const data: AdsConversionJobData = {
      type: "sendConversionEvent",
      data: { adsConversionEventId: "event-1", workspaceId: "ws-1" },
    }

    await processAdsConversionJob(data)

    expect(workerState.handleSendConversionEvent).toHaveBeenCalledWith(
      data.data,
    )
  })

  test("throws (instead of silently dropping) an unrecognized job type", async () => {
    const unknownJob = {
      type: "somethingFuture",
      data: { workspaceId: "ws-1" },
    } as unknown as AdsConversionJobData

    await expect(processAdsConversionJob(unknownJob)).rejects.toThrow(
      UNHANDLED_JOB_TYPE_ERROR,
    )

    expect(workerState.handleEvaluateTemplateSent).not.toHaveBeenCalled()
    expect(workerState.handleEvaluateConversionTrigger).not.toHaveBeenCalled()
    expect(workerState.handleSendConversionEvent).not.toHaveBeenCalled()
    expect(workerState.handleSyncRetargetAudience).not.toHaveBeenCalled()
  })
})
