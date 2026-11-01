import {
  AISpeechToTextDefaultFn,
  AITextToSpeechDefaultFn,
  aiEditImageDefaultFn,
  aiGenerateImageDefaultFn,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { HeavyStepProps } from "../src/integration/handlers/flow-utils"

const mocks = vi.hoisted(() => ({
  heavyQueueAdd: vi.fn(),
  integrationQueueAdd: vi.fn(),
  redis: { eval: vi.fn(), get: vi.fn(), set: vi.fn() },
  saveResultToCustomField: vi.fn(),
}))
const redisState = new Map<string, string>()
const heavyResumeFallbackJobIdPattern = /^heavy-resume-fallback-/
const imageJobIdPattern = /^heavy-aiGenerateImage-/

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
vi.mock("../src/env", () => ({
  env: {
    HEAVY_JOB_WAIT_TIMEOUT_MS: 120_000,
    MUSE_TRANSCRIBE_TIMEOUT_MS: 540_000,
  },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/integration/utils/contact", () => ({
  saveResultToCustomField: mocks.saveResultToCustomField,
}))

const STALE_WRITE_MS = 10_000

/**
 * JS mirror of the `transitionOutcome` Lua script, enough to drive the
 * outcome state machine through `completeHeavyStep`.
 */
function evalTransition(
  _script: string,
  _keys: number,
  key: string,
  nowArg: string,
  nextStatus: string,
  errorMessage: string,
  staleMs: string,
  resultStatus: string,
  outputValues: string,
): Promise<string> {
  const raw = redisState.get(key)
  if (!raw) {
    return Promise.resolve("missing")
  }
  const obj = JSON.parse(raw)
  const now = Number(nowArg)
  if (obj.status === "succeeded" || obj.status === "failed") {
    return Promise.resolve(obj.status)
  }
  if (now > Number(obj.deadlineAt)) {
    obj.status = "failed"
    obj.errorMessage = "Heavy step timed out"
    obj.outputValues = undefined
    redisState.set(key, JSON.stringify(obj))
    return Promise.resolve("failed")
  }
  if (nextStatus === "writing") {
    if (
      obj.status === "pending" ||
      (obj.status === "writing" &&
        (!obj.writingStartedAt || now - obj.writingStartedAt > Number(staleMs)))
    ) {
      obj.status = "writing"
      obj.writingStartedAt = now
      if (obj.outputValues === undefined && outputValues !== "") {
        obj.outputValues = JSON.parse(outputValues)
      }
      redisState.set(key, JSON.stringify(obj))
      return Promise.resolve(
        JSON.stringify({ claim: "writing", outputValues: obj.outputValues }),
      )
    }
    // Another attempt holds a fresh lease.
    return Promise.resolve(obj.status === "writing" ? "busy" : obj.status)
  }
  obj.status = nextStatus
  obj.writingStartedAt = undefined
  obj.outputValues = undefined
  if (nextStatus === "failed") {
    obj.errorMessage = errorMessage
  }
  if (nextStatus === "succeeded") {
    obj.resultStatus = resultStatus
  }
  redisState.set(key, JSON.stringify(obj))
  return Promise.resolve(nextStatus)
}

const { HeavyJobAction } = await import("@chatbotx.io/worker-config")
const {
  buildHeavyJobId,
  buildHeavyOutcomeKey,
  buildHeavyStepIdentityHash,
  claimHeavyStepResume,
  completeHeavyStep,
  failHeavyStep,
  resolveHeavyStepAttempt,
  runViaHeavyWorker,
} = await import("../src/integration/handlers/heavy-step-runner")

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
  mocks.redis.eval.mockImplementation(evalTransition)
  mocks.saveResultToCustomField.mockResolvedValue(undefined)
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

function makeImageProps(): HeavyStepProps<
  ReturnType<typeof aiGenerateImageDefaultFn>
> {
  return {
    ...makeProps(),
    step: aiGenerateImageDefaultFn({
      id: "9",
      outputFieldId: "field-out",
      prompt: "product box",
    }),
  } as HeavyStepProps<ReturnType<typeof aiGenerateImageDefaultFn>>
}

function imageOutcomeKey(props = makeImageProps()): string {
  return buildHeavyOutcomeKey({
    action: HeavyJobAction.aiGenerateImage,
    contactInboxId: props.contactInbox.id,
    conversationId: props.conversation.id,
    parentJobId: props.flowExecutionKey,
    stepId: props.step.id,
  })
}

const completeInput = (
  outcomeKey: string,
  result: Parameters<typeof completeHeavyStep>[0]["result"],
) => ({
  contactId: "contact-1",
  contactInboxId: "contact-inbox-1",
  outcomeKey,
  result,
  workspaceId: "workspace-1",
})

const twoOutputs = [
  { customFieldId: "field-out", value: "https://cdn/image.png" },
  { customFieldId: "field-details", value: '{"count":1}' },
]

describe("aiGenerateImage heavy outcome", () => {
  test("enqueues the image step with its schema-parsed config", async () => {
    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
    ).resolves.toEqual({ result: null, status: "wait" })

    const [name, data, options] = mocks.heavyQueueAdd.mock.calls[0] ?? []
    expect(name).toBe(HeavyJobAction.aiGenerateImage)
    expect(data.type).toBe(HeavyJobAction.aiGenerateImage)
    expect(data.data.step.prompt).toBe("product box")
    expect(options.jobId).toMatch(imageJobIdPattern)
    expect(options.attempts).toBe(2)
  })

  test("duplicate enqueue reuses the same job id", async () => {
    await runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps())
    await runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps())

    const [first, second] = mocks.heavyQueueAdd.mock.calls
    expect(first?.[2].jobId).toBe(second?.[2].jobId)
  })

  test("writes every output value then routes success", async () => {
    const outcomeKey = imageOutcomeKey()
    redisState.set(
      outcomeKey,
      JSON.stringify({ deadlineAt: Date.now() + 60_000, status: "pending" }),
    )

    await completeHeavyStep(
      completeInput(outcomeKey, {
        status: "success",
        outputValues: twoOutputs,
      }),
    )

    expect(mocks.saveResultToCustomField).toHaveBeenCalledTimes(2)
    expect(mocks.saveResultToCustomField).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        customFieldId: "field-out",
        fullText: "https://cdn/image.png",
      }),
    )
    expect(mocks.saveResultToCustomField).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        customFieldId: "field-details",
        fullText: '{"count":1}',
      }),
    )
    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
    ).resolves.toEqual({ result: null, status: "success" })
  })

  test("a terminal skip writes nothing and resumes through skip on every redelivery", async () => {
    const outcomeKey = imageOutcomeKey()
    redisState.set(
      outcomeKey,
      JSON.stringify({ deadlineAt: Date.now() + 60_000, status: "pending" }),
    )

    await completeHeavyStep(completeInput(outcomeKey, { status: "skip" }))
    // A redelivered job cannot turn the no-match into success.
    await completeHeavyStep(
      completeInput(outcomeKey, {
        status: "success",
        outputValues: twoOutputs,
      }),
    )

    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    for (let resume = 0; resume < 2; resume += 1) {
      await expect(
        runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
      ).resolves.toEqual({ result: null, status: "skip" })
    }
    expect(mocks.heavyQueueAdd).not.toHaveBeenCalled()
    expect(await resolveHeavyStepAttempt(outcomeKey)).toEqual({
      action: "skip",
    })
  })

  test("a terminal error routes error", async () => {
    const outcomeKey = imageOutcomeKey()
    redisState.set(
      outcomeKey,
      JSON.stringify({ deadlineAt: Date.now() + 60_000, status: "pending" }),
    )

    await completeHeavyStep(
      completeInput(outcomeKey, { status: "error", errorMessage: "bad image" }),
    )

    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
    ).resolves.toEqual({
      errorMessage: "bad image",
      result: null,
      status: "error",
    })
  })

  test("a legacy succeeded outcome without resultStatus still routes success", async () => {
    redisState.set(
      imageOutcomeKey(),
      JSON.stringify({ deadlineAt: Date.now() + 60_000, status: "succeeded" }),
    )

    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
    ).resolves.toEqual({ result: null, status: "success" })
  })

  test("replays the stored values after the second field write throws", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const outcomeKey = imageOutcomeKey()
      redisState.set(
        outcomeKey,
        JSON.stringify({ deadlineAt: Date.now() + 600_000, status: "pending" }),
      )
      mocks.saveResultToCustomField
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("db down"))

      await expect(
        completeHeavyStep(
          completeInput(outcomeKey, {
            status: "success",
            outputValues: twoOutputs,
          }),
        ),
      ).rejects.toThrow("db down")

      // A fresh writer still owns the lease: the retry must not run yet.
      expect(await resolveHeavyStepAttempt(outcomeKey)).toEqual({
        action: "skip",
      })

      // BullMQ retries after the 15s backoff, past the stale-write window.
      vi.setSystemTime(Date.now() + STALE_WRITE_MS + 1)
      const attempt = await resolveHeavyStepAttempt(outcomeKey)
      expect(attempt).toEqual({ action: "replay", outputValues: twoOutputs })
      if (attempt.action !== "replay") {
        throw new Error("Expected a replay")
      }

      await completeHeavyStep(
        completeInput(outcomeKey, {
          status: "success",
          outputValues: attempt.outputValues,
        }),
      )

      const writtenFields = mocks.saveResultToCustomField.mock.calls.map(
        ([input]) => input.customFieldId,
      )
      expect(writtenFields).toEqual([
        "field-out",
        "field-details",
        "field-out",
        "field-details",
      ])
      await expect(
        runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
      ).resolves.toEqual({ result: null, status: "success" })
      // The finished outcome no longer carries the payload.
      expect(readState(outcomeKey).outputValues).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  test("a stale reclaim writes the values stored by the first claim", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const outcomeKey = imageOutcomeKey()
      pendingOutcome(outcomeKey, 600_000)
      mocks.saveResultToCustomField.mockRejectedValueOnce(new Error("db down"))

      await expect(
        completeHeavyStep(
          completeInput(outcomeKey, {
            status: "success",
            outputValues: twoOutputs,
          }),
        ),
      ).rejects.toThrow("db down")
      expect(readState(outcomeKey)).toMatchObject({
        outputValues: twoOutputs,
        status: "writing",
      })

      vi.setSystemTime(Date.now() + STALE_WRITE_MS + 1)
      const recomputed = [
        {
          customFieldId: "field-out",
          value: "https://cdn/image-recomputed.png",
        },
        { customFieldId: "field-details", value: '{"count":2}' },
      ]
      await completeHeavyStep(
        completeInput(outcomeKey, {
          status: "success",
          outputValues: recomputed,
        }),
      )

      const written = mocks.saveResultToCustomField.mock.calls
        .slice(1)
        .map(([input]) => input.fullText)
      expect(written).toEqual(["https://cdn/image.png", '{"count":1}'])
    } finally {
      vi.useRealTimers()
    }
  })

  test.each([
    HeavyJobAction.aiEditImage,
    HeavyJobAction.aiGenerateImage,
    HeavyJobAction.aiSpeechToText,
    HeavyJobAction.aiTextToSpeech,
  ])("keeps the single-output write for %s", async (action) => {
    const outcomeKey = `heavy-step-outcome:${action}:legacy`
    redisState.set(
      outcomeKey,
      JSON.stringify({ deadlineAt: Date.now() + 60_000, status: "pending" }),
    )

    await completeHeavyStep(
      completeInput(outcomeKey, {
        status: "success",
        outputValues: [{ customFieldId: "field-1", value: "https://cdn/a" }],
      }),
    )

    expect(mocks.saveResultToCustomField).toHaveBeenCalledOnce()
    expect(JSON.parse(redisState.get(outcomeKey) ?? "{}")).toMatchObject({
      resultStatus: "success",
      status: "succeeded",
    })
  })
})

const pendingOutcome = (key: string, deadlineOffsetMs = 60_000) =>
  redisState.set(
    key,
    JSON.stringify({
      deadlineAt: Date.now() + deadlineOffsetMs,
      status: "pending",
    }),
  )

const readState = (key: string) => JSON.parse(redisState.get(key) ?? "null")

describe("heavy outcome state machine", () => {
  test.each([
    ["missing", undefined, "skip"],
    ["pending", { status: "pending" }, "run"],
    [
      "writing without a start time",
      { status: "writing", outputValues: twoOutputs },
      "replay",
    ],
    [
      "fresh writing",
      {
        status: "writing",
        outputValues: twoOutputs,
        writingStartedAt: Date.now(),
      },
      "skip",
    ],
    [
      "stale writing",
      {
        status: "writing",
        outputValues: twoOutputs,
        writingStartedAt: Date.now() - STALE_WRITE_MS - 1,
      },
      "replay",
    ],
    [
      "stale writing without stored values",
      { status: "writing", writingStartedAt: Date.now() - STALE_WRITE_MS - 1 },
      "skip",
    ],
    ["succeeded", { status: "succeeded", resultStatus: "success" }, "skip"],
    ["skipped", { status: "succeeded", resultStatus: "skip" }, "skip"],
    ["failed", { status: "failed", errorMessage: "x" }, "skip"],
    ["unparseable JSON", "{not json", "skip"],
    [
      "invalid resultStatus",
      { status: "succeeded", resultStatus: "maybe" },
      "skip",
    ],
  ])("resolveHeavyStepAttempt for %s outcome is %s", async (_name, state, expected) => {
    const key = "heavy-step-outcome:aiGenerateImage:state"
    if (typeof state === "string") {
      redisState.set(key, state)
    } else if (state) {
      redisState.set(
        key,
        JSON.stringify({ deadlineAt: Date.now() + 60_000, ...state }),
      )
    }

    const attempt = await resolveHeavyStepAttempt(key)
    expect(attempt.action).toBe(expected)
    if (attempt.action === "replay") {
      expect(attempt.outputValues).toEqual(twoOutputs)
    }
  })

  test("keeps the 30s resume lease independent of the stale-write window", async () => {
    mocks.redis.eval.mockResolvedValueOnce("claimed")

    await claimHeavyStepResume({
      outcomeKey: "heavy-step-outcome:aiGenerateImage:lease",
      resumeLeaseToken: "token-1",
    })

    const [, , key, , token, leaseMs] = mocks.redis.eval.mock.calls[0] ?? []
    expect(key).toBe("heavy-step-outcome:aiGenerateImage:lease")
    expect(token).toBe("token-1")
    expect(leaseMs).toBe("30000")
  })

  test("does not write when a fresh writer already holds the lease", async () => {
    const key = imageOutcomeKey()
    redisState.set(
      key,
      JSON.stringify({
        deadlineAt: Date.now() + 60_000,
        status: "writing",
        writingStartedAt: Date.now(),
      }),
    )

    await completeHeavyStep(
      completeInput(key, { status: "success", outputValues: twoOutputs }),
    )

    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    expect(readState(key).status).toBe("writing")
  })

  test("a result after the deadline writes nothing and routes error", async () => {
    const key = imageOutcomeKey()
    pendingOutcome(key, -1)

    await completeHeavyStep(
      completeInput(key, { status: "success", outputValues: twoOutputs }),
    )

    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    expect(readState(key)).toMatchObject({
      errorMessage: "Heavy step timed out",
      status: "failed",
    })
  })

  test("a terminal failure cannot be overwritten by a late success", async () => {
    const key = imageOutcomeKey()
    pendingOutcome(key)

    await failHeavyStep(key, new Error("Meta 500"))
    await completeHeavyStep(
      completeInput(key, { status: "success", outputValues: twoOutputs }),
    )

    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
    ).resolves.toEqual({
      errorMessage: "Meta 500",
      result: null,
      status: "error",
    })
  })

  test("a terminal success cannot be overwritten by a late failure", async () => {
    const key = imageOutcomeKey()
    pendingOutcome(key)

    await completeHeavyStep(
      completeInput(key, { status: "success", outputValues: twoOutputs }),
    )
    await failHeavyStep(key, new Error("late"))

    expect(readState(key)).toMatchObject({
      resultStatus: "success",
      status: "succeeded",
    })
  })

  test("a terminal skip cannot be overwritten by a late failure", async () => {
    const key = imageOutcomeKey()
    pendingOutcome(key)

    await completeHeavyStep(completeInput(key, { status: "skip" }))
    await failHeavyStep(key, new Error("late"))

    expect(readState(key)).toMatchObject({
      resultStatus: "skip",
      status: "succeeded",
    })
  })

  test("waits without enqueueing while another attempt is writing", async () => {
    redisState.set(
      imageOutcomeKey(),
      JSON.stringify({
        deadlineAt: Date.now() + 60_000,
        status: "writing",
        writingStartedAt: Date.now(),
      }),
    )

    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
    ).resolves.toEqual({ result: null, status: "wait" })
    expect(mocks.heavyQueueAdd).not.toHaveBeenCalled()
  })

  test("refuses to run when the outcome cannot be read back", async () => {
    redisState.set(imageOutcomeKey(), "{corrupt")

    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, makeImageProps()),
    ).rejects.toThrow("Heavy step outcome was not persisted")
    expect(mocks.heavyQueueAdd).not.toHaveBeenCalled()
  })
})

describe("heavy step enqueue", () => {
  test("rejects an invalid step before any job is queued", async () => {
    const props = makeImageProps()
    props.step = { ...props.step, prompt: " " }

    await expect(
      runViaHeavyWorker(HeavyJobAction.aiGenerateImage, props),
    ).rejects.toThrow()
    expect(mocks.heavyQueueAdd).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("schedules the fallback resume at the full retry budget", async () => {
    const props = makeImageProps()
    await runViaHeavyWorker(HeavyJobAction.aiGenerateImage, props)

    const identity = buildHeavyStepIdentityHash({
      action: HeavyJobAction.aiGenerateImage,
      contactInboxId: props.contactInbox.id,
      conversationId: props.conversation.id,
      parentJobId: props.flowExecutionKey,
      stepId: props.step.id,
    })
    // 2 attempts × 120s + 30s backoff + 60s handoff.
    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith(
      "resumeHeavyStep",
      expect.objectContaining({
        data: expect.objectContaining({ startFromStepId: "9" }),
      }),
      { delay: 330_000, jobId: `heavy-resume-fallback-${identity}` },
    )
    const [, , options] = mocks.heavyQueueAdd.mock.calls[0] ?? []
    expect(options.jobId).toBe(`heavy-aiGenerateImage-${identity}`)
    expect(imageOutcomeKey()).toBe(
      `heavy-step-outcome:aiGenerateImage:${identity}`,
    )
  })

  test("sizes the Muse speech-to-text deadline and fallback from its own timeout", async () => {
    const props = {
      ...makeProps(),
      step: AISpeechToTextDefaultFn({
        id: "22",
        provider: "muse",
        inputFieldId: "field-in",
        outputFieldId: "field-out",
      }),
    } as never
    const before = Date.now()
    await runViaHeavyWorker(HeavyJobAction.aiSpeechToText, props)

    // 2 attempts × 540s + 15s backoff + 60s handoff.
    const budget = 2 * 540_000 + 15_000 + 60_000
    const [, , options] = mocks.integrationQueueAdd.mock.calls[0] ?? []
    expect(options.delay).toBe(budget)
    const [, rawState, , ttl] = mocks.redis.set.mock.calls[0] ?? []
    expect(JSON.parse(rawState).deadlineAt).toBeGreaterThanOrEqual(
      before + budget,
    )
    expect(ttl).toBeGreaterThan(budget)
  })

  test("keeps the OpenAI speech-to-text deadline on the shared budget", async () => {
    await runViaHeavyWorker(HeavyJobAction.aiSpeechToText, {
      ...makeProps(),
      step: AISpeechToTextDefaultFn({
        id: "22",
        inputFieldId: "field-in",
        outputFieldId: "field-out",
      }),
    } as never)

    const [, , options] = mocks.integrationQueueAdd.mock.calls[0] ?? []
    expect(options.delay).toBe(2 * 120_000 + 15_000 + 60_000)
  })

  test("gives each execution of the same step its own identity", () => {
    const base = {
      action: HeavyJobAction.aiGenerateImage,
      contactInboxId: "contact-inbox-1",
      conversationId: "conversation-1",
      stepId: "9",
    }
    const first = buildHeavyStepIdentityHash({ ...base, parentJobId: "run-1" })

    expect(buildHeavyStepIdentityHash({ ...base, parentJobId: "run-1" })).toBe(
      first,
    )
    expect(
      buildHeavyStepIdentityHash({ ...base, parentJobId: "run-2" }),
    ).not.toBe(first)
    expect(
      buildHeavyStepIdentityHash({
        ...base,
        action: HeavyJobAction.aiEditImage,
        parentJobId: "run-1",
      }),
    ).not.toBe(first)
  })

  test("keeps button targets and drops the version for latest-version runs", async () => {
    const props = {
      ...makeImageProps(),
      targetId: "button-1",
      targetType: "button" as const,
      useLatestFlowVersion: true,
    }
    await runViaHeavyWorker(HeavyJobAction.aiGenerateImage, props)

    const [, data] = mocks.heavyQueueAdd.mock.calls[0] ?? []
    expect(data.data.continuation).toMatchObject({
      flowId: "flow-1",
      targetId: "button-1",
      targetType: "button",
    })
    expect(data.data.continuation.flowVersionId).toBeUndefined()
  })

  test("drops node and step target types from the queue continuation", async () => {
    await runViaHeavyWorker(HeavyJobAction.aiGenerateImage, {
      ...makeImageProps(),
      targetType: "step" as const,
    })

    const [, data] = mocks.heavyQueueAdd.mock.calls[0] ?? []
    expect(data.data.continuation.targetType).toBeUndefined()
    expect(data.data.continuation.flowVersionId).toBe("flow-version-1")
  })

  test.each([
    [
      HeavyJobAction.aiEditImage,
      () =>
        aiEditImageDefaultFn({
          id: "21",
          inputFieldId: "field-in",
          prompt: "brighter",
          outputFieldId: "field-out",
        }),
    ],
    [
      HeavyJobAction.aiSpeechToText,
      () =>
        AISpeechToTextDefaultFn({
          id: "22",
          inputFieldId: "field-in",
          outputFieldId: "field-out",
        }),
    ],
    [
      HeavyJobAction.aiTextToSpeech,
      () =>
        AITextToSpeechDefaultFn({
          id: "23",
          message: "Xin chao",
          outputFieldId: "field-out",
        }),
    ],
  ])("still enqueues %s with its own step schema", async (action, makeStep) => {
    await runViaHeavyWorker(action, {
      ...makeProps(),
      step: makeStep(),
    } as never)

    const [name, data] = mocks.heavyQueueAdd.mock.calls[0] ?? []
    expect(name).toBe(action)
    expect(data.type).toBe(action)
    expect(data.data.step.stepType).toBe(action)
  })
})
