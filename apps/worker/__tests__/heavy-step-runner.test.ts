import { aiGenerateImageDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { HeavyStepProps } from "../src/integration/handlers/flow-utils"

const mocks = vi.hoisted(() => ({
  heavyQueueAdd: vi.fn(),
  integrationQueueAdd: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn() },
}))
const redisState = new Map<string, string>()
const heavyResumeFallbackJobIdPattern = /^heavy-resume-fallback-/

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    getRedisConnection: () => mocks.redis,
    heavyQueue: { add: mocks.heavyQueueAdd },
    integrationQueue: { add: mocks.integrationQueueAdd },
  }
})
vi.mock("../src/env", () => ({ env: { HEAVY_JOB_WAIT_TIMEOUT_MS: 120_000 } }))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const { HeavyJobAction } = await import("@chatbotx.io/worker-config")
const { buildHeavyJobId, runViaHeavyWorker } = await import(
  "../src/integration/handlers/heavy-step-runner"
)

function makeProps(): HeavyStepProps<
  ReturnType<typeof aiGenerateImageDefaultFn>
> {
  return {
    contactInbox: { id: "contact-inbox-1" },
    conversation: {
      contactId: "contact-1",
      id: "conversation-1",
      workspaceId: "workspace-1",
    },
    flowExecutionKey: "flow-execution-1",
    flowVersion: { flowId: "flow-1", id: "flow-version-1" },
    nodeVisits: { "node-1": 1 },
    step: aiGenerateImageDefaultFn({
      id: "1",
      outputFieldId: "field-1",
      prompt: "A quiet workspace",
    }),
    targetNodeId: "node-1",
  } as HeavyStepProps<ReturnType<typeof aiGenerateImageDefaultFn>>
}

beforeEach(() => {
  vi.clearAllMocks()
  redisState.clear()
  mocks.redis.get.mockImplementation((key: string) =>
    Promise.resolve(redisState.get(key) ?? null),
  )
  mocks.redis.set.mockImplementation((key: string, value: string) => {
    if (!redisState.has(key)) {
      redisState.set(key, value)
    }
    return Promise.resolve("OK")
  })
  mocks.heavyQueueAdd.mockResolvedValue({ id: "heavy-job-1" })
  mocks.integrationQueueAdd.mockResolvedValue({ id: "fallback-job-1" })
})

describe("runViaHeavyWorker", () => {
  test("enqueues heavy work and releases integration worker immediately", async () => {
    const result = await runViaHeavyWorker(
      HeavyJobAction.aiGenerateImage,
      makeProps(),
    )

    expect(result).toEqual({ result: null, status: "wait" })
    expect(mocks.heavyQueueAdd).toHaveBeenCalledOnce()
    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith(
      "resumeHeavyStep",
      expect.objectContaining({
        data: expect.objectContaining({
          flowExecutionKey: "flow-execution-1",
          startFromStepId: "1",
        }),
        type: "resumeHeavyStep",
      }),
      expect.objectContaining({
        delay: expect.any(Number),
        jobId: expect.stringMatching(heavyResumeFallbackJobIdPattern),
      }),
    )
    const [, data, options] = mocks.heavyQueueAdd.mock.calls[0] ?? []
    expect(data.data.continuation.flowExecutionKey).toBe("flow-execution-1")
    expect(data.data.outcomeKey).toContain("heavy-step-outcome")
    expect(options.jobId).not.toContain(":")
  })

  test("returns terminal outcome without enqueueing a second provider call", async () => {
    const props = makeProps()
    const jobId = buildHeavyJobId({
      action: HeavyJobAction.aiGenerateImage,
      contactInboxId: props.contactInbox.id,
      conversationId: props.conversation.id,
      parentJobId: props.flowExecutionKey,
      stepId: props.step.id,
    })
    const outcomeKey = `heavy-step-outcome:aiGenerateImage:${jobId.slice("heavy-aiGenerateImage-".length)}`
    redisState.set(
      outcomeKey,
      JSON.stringify({ deadlineAt: Date.now() + 60_000, status: "succeeded" }),
    )

    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, props),
    ).resolves.toEqual({ result: null, status: "success" })
    expect(mocks.heavyQueueAdd).not.toHaveBeenCalled()
  })

  test("uses terminal error for flow error routing", async () => {
    const props = makeProps()
    const jobId = buildHeavyJobId({
      action: HeavyJobAction.aiGenerateImage,
      contactInboxId: props.contactInbox.id,
      conversationId: props.conversation.id,
      parentJobId: props.flowExecutionKey,
      stepId: props.step.id,
    })
    const outcomeKey = `heavy-step-outcome:aiGenerateImage:${jobId.slice("heavy-aiGenerateImage-".length)}`
    redisState.set(
      outcomeKey,
      JSON.stringify({
        deadlineAt: Date.now() + 60_000,
        errorMessage: "provider failed",
        status: "failed",
      }),
    )

    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, props),
    ).resolves.toEqual({
      errorMessage: "provider failed",
      result: null,
      status: "error",
    })
  })
})
