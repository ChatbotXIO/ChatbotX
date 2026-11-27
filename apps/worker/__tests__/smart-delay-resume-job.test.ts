import { smartDelayTypes } from "@chatbotx.io/database/partials"
import { ENQUEUE_DELAY_MS } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  smartDelayService: {
    upsertStepInputTimeout: vi.fn(),
    markScheduled: vi.fn(async () => undefined),
    resetToPending: vi.fn(async () => undefined),
  },
  queueAdd: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: mocks.smartDelayService,
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  integrationQueue: { add: mocks.queueAdd },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const {
  buildSendFlowResumeJob,
  scheduleSmartDelayResume,
  smartDelayResumeJobFactories,
} = await import("../src/integration/handlers/smart-delay")

const row = {
  id: "row-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  flowId: "flow-1",
  flowVersionId: "fv-1",
  nodeId: "node-1",
  metadata: null,
  appointmentId: null,
} as unknown as Parameters<typeof buildSendFlowResumeJob>[0]

describe("buildSendFlowResumeJob", () => {
  test("never emits startedByContactMessage, so a delayed resume is not message-driven", () => {
    const job = buildSendFlowResumeJob(row, {
      sendFrom: "inbox",
      appointmentId: "appt-1",
      startedByContactMessage: true,
    } as never)

    expect(job.data.data).not.toHaveProperty("startedByContactMessage")
    expect(buildSendFlowResumeJob(row).data.data).not.toHaveProperty(
      "startedByContactMessage",
    )
  })
})

describe("step input timeout smart delay", () => {
  const stepInputRow = {
    ...row,
    type: smartDelayTypes.enum.stepInputTimeout,
  } as unknown as Parameters<
    (typeof smartDelayResumeJobFactories)["stepInputTimeout"]
  >[0]

  test("every smart-delay type can be resumed (the scanner builds a job for any claimed row)", () => {
    for (const type of smartDelayTypes.options) {
      expect(typeof smartDelayResumeJobFactories[type]).toBe("function")
    }
  })

  test("resumes through the dedicated job, carrying only the row id", () => {
    const job = smartDelayResumeJobFactories.stepInputTimeout(stepInputRow)

    expect(job).toEqual({
      name: "resumeStepInputTimeout",
      opts: {},
      data: {
        type: "resumeStepInputTimeout",
        data: { smartDelayId: "row-1" },
      },
    })
  })

  describe("scheduleSmartDelayResume", () => {
    const schedule = (triggerAt: Date) =>
      scheduleSmartDelayResume({
        type: smartDelayTypes.enum.stepInputTimeout,
        triggerAt,
        workspaceId: "ws-1",
        flowId: "flow-1",
        flowVersionId: "fv-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        nodeId: "node-1",
        stepId: "step-1",
        metadata: {
          type: "stepInputResolution",
          stepId: "step-1",
          challengeId: "challenge-1",
          reason: "timeout",
        },
      })

    beforeEach(() => {
      vi.clearAllMocks()
      mocks.smartDelayService.upsertStepInputTimeout.mockImplementation(
        async ({ data }: { data: unknown }) => data,
      )
    })

    test("persists through the one-timer-per-conversation upsert, resuming the step's node", async () => {
      await schedule(new Date(Date.now() + 60_000))

      expect(
        mocks.smartDelayService.upsertStepInputTimeout,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "stepInputTimeout",
          nodeId: "node-1",
          stepId: "step-1",
          conversationId: "conv-1",
          status: "pending",
          metadata: expect.objectContaining({ challengeId: "challenge-1" }),
        }),
      })
    })

    test("a near deadline is enqueued with its delay", async () => {
      await schedule(new Date(Date.now() + 30_000))

      expect(mocks.smartDelayService.markScheduled).toHaveBeenCalledOnce()
      expect(mocks.queueAdd).toHaveBeenCalledWith(
        "resumeStepInputTimeout",
        expect.objectContaining({ type: "resumeStepInputTimeout" }),
        expect.objectContaining({
          delay: expect.any(Number),
          jobId: expect.stringContaining("smart-delay-"),
        }),
      )
    })

    test("a far deadline is left to the scanner, not parked in Redis", async () => {
      await schedule(new Date(Date.now() + ENQUEUE_DELAY_MS + 60_000))

      expect(
        mocks.smartDelayService.upsertStepInputTimeout,
      ).toHaveBeenCalledOnce()
      expect(mocks.queueAdd).not.toHaveBeenCalled()
    })

    test("an arm skipped for a replaced question enqueues nothing", async () => {
      mocks.smartDelayService.upsertStepInputTimeout.mockResolvedValueOnce(null)

      await schedule(new Date(Date.now() + 30_000))

      expect(mocks.smartDelayService.markScheduled).not.toHaveBeenCalled()
      expect(mocks.queueAdd).not.toHaveBeenCalled()
    })

    test("a failed enqueue returns the row to pending so the scanner recovers it", async () => {
      mocks.queueAdd.mockRejectedValueOnce(new Error("redis down"))

      await expect(
        schedule(new Date(Date.now() + 30_000)),
      ).resolves.toBeUndefined()

      expect(mocks.smartDelayService.resetToPending).toHaveBeenCalled()
    })
  })
})

describe("resume job priority", () => {
  test("a live flow's resume gets no priority, a broadcast's keeps the scheduled-send tier", () => {
    const broadcastRow = {
      ...row,
      metadata: {
        type: "broadcast",
        broadcastId: "b-1",
        contactInboxId: "ci-1",
      },
    } as unknown as Parameters<typeof buildSendFlowResumeJob>[0]

    expect(buildSendFlowResumeJob(row).opts).toEqual({})
    expect(buildSendFlowResumeJob(broadcastRow).opts).toEqual({ priority: 5 })
  })

  test.each([
    ["waitNode", "resumeWait"],
    ["followUp", "resumeFollowUp"],
    ["quickReplyFollowUp", "resumeQuickReplyFollowUp"],
  ] as const)("the %s resume job (%s) carries the same priority rule", (type, name) => {
    const broadcastRow = {
      ...row,
      metadata: {
        type: "broadcast",
        broadcastId: "b-1",
        contactInboxId: "ci-1",
      },
    } as unknown as Parameters<typeof buildSendFlowResumeJob>[0]

    const live = smartDelayResumeJobFactories[type](row)
    const scheduled = smartDelayResumeJobFactories[type](broadcastRow)

    expect(live.name).toBe(name)
    expect(live.opts).toEqual({})
    expect(scheduled.opts).toEqual({ priority: 5 })
  })
})
