import { describe, expect, test } from "vitest"
import {
  AI_FILE_EMBEDDING_PRIORITY,
  AIJobAction,
  aiJobDataSchema,
  buildTranslateMessagesJobId,
  getTranslateMessagesJobOptions,
  TRANSLATION_JOB_MAX_MESSAGES,
  TRANSLATION_JOB_PRIORITY,
} from "../src/queues/ai-agent"

const createdAt = new Date("2026-11-19T00:00:00.000Z")

const job = (overrides: Record<string, unknown> = {}) => ({
  type: AIJobAction.translateMessages,
  data: {
    workspaceId: "w1",
    conversationId: "c1",
    messages: [{ id: "m1", createdAt }],
    retryFailed: false,
    requestId: "req-1",
    ...overrides,
  },
})

describe("translateMessages job schema", () => {
  test("parses a payload, reviving createdAt from its JSON form", () => {
    const viaRedis = JSON.parse(JSON.stringify(job()))

    const parsed = aiJobDataSchema.parse(viaRedis)

    expect(parsed).toEqual(job())
  })

  test.each([
    ["no workspaceId", { workspaceId: undefined }],
    ["no requestId", { requestId: "" }],
    ["no retryFailed", { retryFailed: undefined }],
    ["an empty message list", { messages: [] }],
    ["a message without an id", { messages: [{ createdAt }] }],
    ["an invalid createdAt", { messages: [{ id: "m1", createdAt: "nope" }] }],
    [
      `more than ${TRANSLATION_JOB_MAX_MESSAGES} messages`,
      {
        messages: Array.from(
          { length: TRANSLATION_JOB_MAX_MESSAGES + 1 },
          (_, i) => ({
            id: `m${i}`,
            createdAt,
          }),
        ),
      },
    ],
  ])("rejects %s", (_name, overrides) => {
    expect(aiJobDataSchema.safeParse(job(overrides)).success).toBe(false)
  })
})

describe("translation job options", () => {
  test("runs behind AI replies (no priority) and ahead of embedding chunks", () => {
    const { priority } = getTranslateMessagesJobOptions("id")

    expect(priority).toBe(TRANSLATION_JOB_PRIORITY)
    expect(priority).toBeGreaterThan(0)
    expect(priority).toBeLessThan(AI_FILE_EMBEDDING_PRIORITY)
  })

  test("sets its own attempts and back-off instead of the queue default", () => {
    expect(getTranslateMessagesJobOptions("id")).toMatchObject({
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      jobId: "id",
    })
  })
})

describe("buildTranslateMessagesJobId", () => {
  const props = { conversationId: "c1", messageIds: ["m2", "m1"] }

  test("is unique per call time, so a re-request is not swallowed by a kept job", () => {
    expect(buildTranslateMessagesJobId({ ...props, now: 1 })).not.toBe(
      buildTranslateMessagesJobId({ ...props, now: 2 }),
    )
  })

  test("does not depend on message order, and has no colon", () => {
    const a = buildTranslateMessagesJobId({ ...props, now: 1 })
    const b = buildTranslateMessagesJobId({
      ...props,
      messageIds: ["m1", "m2"],
      now: 1,
    })

    expect(a).toBe(b)
    expect(a).not.toContain(":")
  })

  test("differs for different messages", () => {
    expect(
      buildTranslateMessagesJobId({ ...props, messageIds: ["m1"], now: 1 }),
    ).not.toBe(buildTranslateMessagesJobId({ ...props, now: 1 }))
  })
})
