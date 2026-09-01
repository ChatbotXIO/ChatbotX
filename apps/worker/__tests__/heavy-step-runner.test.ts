import { aiGenerateImageDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { HeavyStepProps } from "../src/integration/handlers/flow-utils"

const mocks = vi.hoisted(() => ({
  getHeavyQueueEvents: vi.fn(() => ({})),
  heavyQueueAdd: vi.fn(),
  redis: {
    eval: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
  saveResultToCustomField: vi.fn(),
}))

const redisState = new Map<string, string>()

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    getHeavyQueueEvents: mocks.getHeavyQueueEvents,
    getRedisConnection: () => mocks.redis,
    heavyQueue: { add: mocks.heavyQueueAdd },
  }
})

vi.mock("../src/env", () => ({
  env: { HEAVY_JOB_WAIT_TIMEOUT_MS: 120_000 },
}))

vi.mock("../src/integration/utils/contact", () => ({
  saveResultToCustomField: mocks.saveResultToCustomField,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const { HeavyJobAction } = await import("@chatbotx.io/worker-config")
const { buildHeavyJobId, runViaHeavyWorker } = await import(
  "../src/integration/handlers/heavy-step-runner"
)

function makeProps(
  overrides: Partial<{
    contactInboxId: string
    conversationId: string
    flowExecutionKey: string
    stepId: string
  }> = {},
) {
  const conversationId = overrides.conversationId ?? "conversation-1"
  const contactInboxId = overrides.contactInboxId ?? "contact-inbox-1"

  return {
    conversation: {
      id: conversationId,
      contactId: "contact-1",
      workspaceId: "workspace-1",
    },
    contactInbox: {
      id: contactInboxId,
    },
    flowExecutionKey: overrides.flowExecutionKey ?? "parent-job-1",
    step: aiGenerateImageDefaultFn({
      id: overrides.stepId ?? "step-1",
      prompt: "A quiet workspace",
      outputFieldId: "custom-field-1",
    }),
  } as HeavyStepProps<ReturnType<typeof aiGenerateImageDefaultFn>>
}

beforeEach(() => {
  vi.clearAllMocks()
  redisState.clear()

  mocks.redis.get.mockImplementation((key: string) =>
    Promise.resolve(redisState.get(key) ?? null),
  )
  mocks.redis.set.mockImplementation(
    (key: string, value: string, _px: string, _ttl: number, nx: string) => {
      if (nx === "NX" && redisState.has(key)) {
        return Promise.resolve(null)
      }
      redisState.set(key, value)
      return Promise.resolve("OK")
    },
  )
  mocks.redis.eval.mockImplementation(
    (script: string, _keys: number, key: string) => {
      const raw = redisState.get(key)
      if (!raw) {
        return Promise.resolve("timed_out")
      }
      const parsed = JSON.parse(raw) as {
        status: "pending" | "succeeded" | "timed_out"
        deadlineAt: number
      }
      if (script.includes("deadlineAt") && parsed.status === "pending") {
        parsed.status = "succeeded"
        redisState.set(key, JSON.stringify(parsed))
        return Promise.resolve("succeeded")
      }
      if (parsed.status === "pending") {
        parsed.status = "timed_out"
        redisState.set(key, JSON.stringify(parsed))
        return Promise.resolve("timed_out")
      }
      return Promise.resolve(parsed.status)
    },
  )
})

describe("runViaHeavyWorker", () => {
  test("writes the output value only after a successful bounded wait", async () => {
    const waitUntilFinished = vi.fn(async () => ({
      status: "success",
      outputValue: "https://cdn.example.com/result.png",
    }))
    mocks.heavyQueueAdd.mockResolvedValue({ waitUntilFinished })

    const result = await runViaHeavyWorker(
      HeavyJobAction.aiGenerateImage,
      makeProps(),
    )

    expect(result).toEqual({ status: "success", result: null })
    expect(mocks.saveResultToCustomField).toHaveBeenCalledWith({
      contactId: "contact-1",
      customFieldId: "custom-field-1",
      fullText: "https://cdn.example.com/result.png",
      workspaceId: "workspace-1",
      contactInboxId: "contact-inbox-1",
    })
    expect(waitUntilFinished).toHaveBeenCalledWith({}, 120_000)
    const options = mocks.heavyQueueAdd.mock.calls[0]?.[2]
    expect(options.jobId).not.toContain(":")
  })

  test("does not write after timeout and keeps retries on the error outcome", async () => {
    const waitUntilFinished = vi.fn(() =>
      Promise.reject(new Error("timed out")),
    )
    mocks.heavyQueueAdd.mockResolvedValue({ waitUntilFinished })
    const props = makeProps()

    const firstResult = await runViaHeavyWorker(
      HeavyJobAction.aiGenerateImage,
      props,
    )
    const retryResult = await runViaHeavyWorker(
      HeavyJobAction.aiGenerateImage,
      props,
    )

    expect(firstResult.status).toBe("error")
    expect(retryResult).toEqual({
      status: "error",
      errorMessage: "Heavy step already timed out",
      result: null,
    })
    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    expect(mocks.heavyQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("rejects invalid heavy result shapes without writing", async () => {
    mocks.heavyQueueAdd.mockResolvedValue({
      waitUntilFinished: vi.fn(async () => ({ status: "success" })),
    })

    const result = await runViaHeavyWorker(
      HeavyJobAction.aiGenerateImage,
      makeProps(),
    )

    expect(result.status).toBe("error")
    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
  })
})

describe("buildHeavyJobId", () => {
  test("hashes the full tuple into a BullMQ-safe id", () => {
    const base = {
      action: HeavyJobAction.aiGenerateImage,
      parentJobId: "parent:job:1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      stepId: "step-1",
    }

    const id = buildHeavyJobId(base)
    const otherConversationId = buildHeavyJobId({
      ...base,
      conversationId: "conversation-2",
    })
    const otherContactInboxId = buildHeavyJobId({
      ...base,
      contactInboxId: "contact-inbox-2",
    })

    expect(id).not.toContain(":")
    expect(otherConversationId).not.toBe(id)
    expect(otherContactInboxId).not.toBe(id)
  })
})
