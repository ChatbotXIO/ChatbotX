import { randomUUID } from "node:crypto"
import { aiGenerateImageDefaultFn } from "@chatbotx.io/flow-config"
import { Redis } from "ioredis"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"
import type { HeavyStepProps } from "../../src/integration/handlers/flow-utils"

/**
 * Runs the heavy-step outcome Lua scripts against a real Redis (db 5 from
 * `global-setup.ts`): the unit suite drives a JS mirror of them, which cannot
 * prove the scripts themselves (cjson encoding, KEEPTTL, nil fields).
 */
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379/5", {
  maxRetriesPerRequest: 1,
})

const mocks = vi.hoisted(() => ({
  heavyQueueAdd: vi.fn(),
  integrationQueueAdd: vi.fn(),
  saveResultToCustomField: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    getRedisConnection: () => redis,
    heavyQueue: { add: mocks.heavyQueueAdd },
    integrationQueue: { add: mocks.integrationQueueAdd },
  }
})
vi.mock("../../src/env", () => ({
  env: { HEAVY_JOB_WAIT_TIMEOUT_MS: 120_000 },
}))
vi.mock("../../src/integration/utils/contact", () => ({
  saveResultToCustomField: mocks.saveResultToCustomField,
}))

const { HeavyJobAction } = await import("@chatbotx.io/worker-config")
const {
  buildHeavyOutcomeKey,
  claimHeavyStepResume,
  completeHeavyStep,
  failHeavyStep,
  finishHeavyStepResume,
  resolveHeavyStepAttempt,
  runViaHeavyWorker,
} = await import("../../src/integration/handlers/heavy-step-runner")

const STALE_WRITE_MS = 10_000
// Redis outlives the process: every run and test gets its own step execution.
const RUN_ID = randomUUID()
let run = 0

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
    flowExecutionKey: `flow-execution-${RUN_ID}-${run}`,
    flowVersion: { flowId: "flow-1", id: "flow-version-1" },
    step: aiGenerateImageDefaultFn({
      id: "9",
      outputFieldId: "field-out",
      prompt: "product box",
    }),
  } as HeavyStepProps<ReturnType<typeof aiGenerateImageDefaultFn>>
}

const createdKeys = new Set<string>()

const outcomeKey = () => {
  const props = makeProps()
  const key = buildHeavyOutcomeKey({
    action: HeavyJobAction.aiGenerateImage,
    contactInboxId: props.contactInbox.id,
    conversationId: props.conversation.id,
    parentJobId: props.flowExecutionKey,
    stepId: props.step.id,
  })
  createdKeys.add(key)
  return key
}

const outputs = [
  { customFieldId: "field-out", value: "https://cdn/image.png" },
  { customFieldId: "field-details", value: '{"count":1}' },
]

const complete = (result: Parameters<typeof completeHeavyStep>[0]["result"]) =>
  completeHeavyStep({
    contactId: "contact-1",
    contactInboxId: "contact-inbox-1",
    outcomeKey: outcomeKey(),
    result,
    workspaceId: "workspace-1",
  })

const readState = async () =>
  JSON.parse((await redis.get(outcomeKey())) ?? "null")

const writeState = (state: Record<string, unknown>) =>
  redis.set(
    outcomeKey(),
    JSON.stringify({ deadlineAt: Date.now() + 60_000, ...state }),
    "PX",
    600_000,
  )

/** Starts the step for real: the first call persists the pending outcome. */
const start = () =>
  runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeProps())

beforeEach(() => {
  vi.clearAllMocks()
  run += 1
  mocks.heavyQueueAdd.mockResolvedValue({ id: "heavy-job" })
  mocks.integrationQueueAdd.mockResolvedValue({ id: "fallback-job" })
  mocks.saveResultToCustomField.mockResolvedValue(undefined)
})

afterAll(async () => {
  if (createdKeys.size > 0) {
    await redis.del(...createdKeys)
  }
  await redis.quit()
})

describe("heavy step outcome (real Redis Lua)", () => {
  test("first run persists a pending outcome with a TTL and enqueues once", async () => {
    await expect(start()).resolves.toEqual({ result: null, status: "wait" })

    expect(await readState()).toMatchObject({ status: "pending" })
    expect(await redis.pttl(outcomeKey())).toBeGreaterThan(0)
    expect(await resolveHeavyStepAttempt(outcomeKey())).toEqual({
      action: "run",
    })
    expect(mocks.heavyQueueAdd).toHaveBeenCalledOnce()
  })

  test("success writes every output, keeps the TTL and routes success", async () => {
    await start()

    await complete({ status: "success", outputValues: outputs })

    expect(mocks.saveResultToCustomField).toHaveBeenCalledTimes(2)
    const state = await readState()
    expect(state).toMatchObject({
      resultStatus: "success",
      status: "succeeded",
    })
    expect(state.writingStartedAt).toBeUndefined()
    expect(state.outputValues).toBeUndefined()
    expect(await redis.pttl(outcomeKey())).toBeGreaterThan(0)
    await expect(start()).resolves.toEqual({ result: null, status: "success" })
    expect(await resolveHeavyStepAttempt(outcomeKey())).toEqual({
      action: "skip",
    })
  })

  test("skip writes nothing and every redelivery routes skip", async () => {
    await start()

    await complete({ status: "skip" })
    await complete({ status: "success", outputValues: outputs })

    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    expect(await readState()).toMatchObject({
      resultStatus: "skip",
      status: "succeeded",
    })
    await expect(start()).resolves.toEqual({ result: null, status: "skip" })
  })

  test("error routes error with its message", async () => {
    await start()

    await complete({ status: "error", errorMessage: "Input is not an image" })

    await expect(start()).resolves.toEqual({
      errorMessage: "Input is not an image",
      result: null,
      status: "error",
    })
  })

  test("a fresh write lease held by another attempt is not shared", async () => {
    await writeState({ status: "writing", writingStartedAt: Date.now() })

    await complete({ status: "success", outputValues: outputs })

    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    expect((await readState()).status).toBe("writing")
    expect(await resolveHeavyStepAttempt(outcomeKey())).toEqual({
      action: "skip",
    })
  })

  test("a stale legacy lease without stored values waits for the deadline", async () => {
    await writeState({
      status: "writing",
      writingStartedAt: Date.now() - STALE_WRITE_MS - 1000,
    })

    expect(await resolveHeavyStepAttempt(outcomeKey())).toEqual({
      action: "skip",
    })
  })

  test("a stale write lease is reclaimed, rewritten and completed", async () => {
    await writeState({
      outputValues: outputs,
      status: "writing",
      writingStartedAt: Date.now() - STALE_WRITE_MS - 1000,
    })

    expect(await resolveHeavyStepAttempt(outcomeKey())).toEqual({
      action: "replay",
      outputValues: outputs,
    })
    await complete({ status: "success", outputValues: outputs })

    expect(mocks.saveResultToCustomField).toHaveBeenCalledTimes(2)
    expect(await readState()).toMatchObject({
      resultStatus: "success",
      status: "succeeded",
    })
  })

  test("the second field failing leaves a lease the retry replays", async () => {
    await start()
    mocks.saveResultToCustomField
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("db down"))

    await expect(
      complete({ status: "success", outputValues: outputs }),
    ).rejects.toThrow("db down")
    expect(await readState()).toMatchObject({
      outputValues: outputs,
      status: "writing",
    })

    // Age the lease as the BullMQ backoff would.
    const state = await readState()
    await writeState({
      ...state,
      writingStartedAt: Date.now() - STALE_WRITE_MS - 1000,
    })
    const attempt = await resolveHeavyStepAttempt(outcomeKey())
    expect(attempt).toEqual({ action: "replay", outputValues: outputs })

    // Even if a retry recomputed different values (the output field being
    // the input field), the reclaim writes the values the first claim stored.
    await complete({
      status: "success",
      outputValues: [
        { customFieldId: "field-out", value: "https://cdn/image-2.png" },
        { customFieldId: "field-details", value: '{"count":2}' },
      ],
    })

    expect(
      mocks.saveResultToCustomField.mock.calls.map(([input]) => input.fullText),
    ).toEqual([
      "https://cdn/image.png",
      '{"count":1}',
      "https://cdn/image.png",
      '{"count":1}',
    ])
    expect((await readState()).outputValues).toBeUndefined()
    await expect(start()).resolves.toEqual({ result: null, status: "success" })
  })

  test("a result after the deadline fails the step as timed out", async () => {
    await writeState({ deadlineAt: Date.now() - 1, status: "pending" })

    await complete({ status: "success", outputValues: outputs })

    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    expect(await readState()).toMatchObject({
      errorMessage: "Heavy step timed out",
      status: "failed",
    })
  })

  test("terminal outcomes are immutable", async () => {
    await start()
    await failHeavyStep(outcomeKey(), new Error("Meta 500"))
    await complete({ status: "success", outputValues: outputs })
    await complete({ status: "skip" })

    expect(await readState()).toMatchObject({
      errorMessage: "Meta 500",
      status: "failed",
    })
    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
  })

  test("a legacy success without resultStatus still routes success", async () => {
    await writeState({ status: "succeeded" })

    await expect(start()).resolves.toEqual({ result: null, status: "success" })
  })

  test("resume is claimed once per terminal outcome", async () => {
    await start()
    expect(
      await claimHeavyStepResume({
        outcomeKey: outcomeKey(),
        resumeLeaseToken: "a",
      }),
    ).toBe("pending")

    await complete({ status: "skip" })
    expect(
      await claimHeavyStepResume({
        outcomeKey: outcomeKey(),
        resumeLeaseToken: "a",
      }),
    ).toBe("claimed")
    expect(
      await claimHeavyStepResume({
        outcomeKey: outcomeKey(),
        resumeLeaseToken: "b",
      }),
    ).toBe("pending")

    await finishHeavyStepResume({
      outcomeKey: outcomeKey(),
      resumeLeaseToken: "a",
      succeeded: true,
    })
    expect(
      await claimHeavyStepResume({
        outcomeKey: outcomeKey(),
        resumeLeaseToken: "b",
      }),
    ).toBe("resumed")
    // The skip branch survives the resume bookkeeping.
    expect(await readState()).toMatchObject({
      resultStatus: "skip",
      resumeStatus: "resumed",
    })
  })
})
