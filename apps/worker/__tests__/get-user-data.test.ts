import { MessageShardUnavailableError } from "@chatbotx.io/database/errors"
import type { ContentType, FileType } from "@chatbotx.io/database/partials"
import { getSafeSinceTime } from "@chatbotx.io/database/repositories"
import type { GetUserDataStepSchema } from "@chatbotx.io/flow-config"
import { ReplyFormat } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ExecuteStepProps } from "../src/integration/handlers/flow"

// --- mocks ---

const lastMessage: {
  current: {
    text?: string | null
    contentType: ContentType
    contentAttributes?: Record<string, unknown> | null
    attachments: { fileType: FileType; originPath: string }[]
  } | null
} = { current: null }
const repositoryError: { current: Error | null } = { current: null }

const contactInboxUpdateTracking = vi.fn(async () => undefined)
const contactCustomFieldSetValueByKey = vi.fn(async () => undefined)
const conversationUpdateChallenge = vi.fn(async () => undefined)
const resolveTenantSettings = vi.fn(async () => ({
  storageUrl: "https://cdn.example.com/",
}))

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: {
    setValueByKey: contactCustomFieldSetValueByKey,
  },
  contactInboxService: { updateTracking: contactInboxUpdateTracking },
  conversationService: { updateChallenge: conversationUpdateChallenge },
  resolveTenantSettings,
}))

// Attachment values are stored as a public URL; mirror getPublicFileUrl's join
// without loading the real module.
vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => {
    let key = path
    if (key.startsWith("/")) {
      key = key.slice(1)
    }
    return `${base}${key}`
  },
}))

// validateUserData reads the last message via the shard-aware repository, not
// db.query. Return the test-configured `lastMessage.current` as a 1-element
// array (findLastByConversation's contract).
vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(async () => ({
    findLastByConversation: vi.fn(() => {
      if (repositoryError.current) {
        throw repositoryError.current
      }
      return lastMessage.current ? [lastMessage.current] : []
    }),
  })),
  getSafeSinceTime: vi.fn(() => new Date(0)),
}))

vi.mock("@chatbotx.io/database/partials", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/partials")>()
  return { ...actual }
})

vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: vi.fn(),
}))

const chatQueueAdd = vi.fn(async () => ({ id: "job-1" }))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    sendChatMessage: "sendChatMessage",
    sendFlowMessage: "sendFlowMessage",
  },
  chatQueue: { add: chatQueueAdd },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: vi.fn() },
  getRedisConnection: vi.fn(() => ({})),
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => undefined),
}))

const waitForChatJobCompletion = vi.fn(async () => undefined)
vi.mock("../src/integration/utils/message", () => ({
  waitForChatJobCompletion,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "test-id"),
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

// --- helpers ---

const { getUserData } = await import(
  "../src/integration/handlers/get-user-data"
)

beforeEach(() => {
  repositoryError.current = null
  chatQueueAdd.mockResolvedValue({ id: "job-1" })
  waitForChatJobCompletion.mockResolvedValue(undefined)
  contactInboxUpdateTracking.mockClear()
  contactCustomFieldSetValueByKey.mockClear()
  conversationUpdateChallenge.mockClear()
  conversationUpdateChallenge.mockResolvedValue(undefined)
})

type StepOverride = Partial<GetUserDataStepSchema>

function makeProps(
  replyFormat: ReplyFormat,
  overrides: StepOverride = {},
  attempts = 1,
  lastAttemptAt: Date | string | number = new Date(),
): ExecuteStepProps<GetUserDataStepSchema> {
  return {
    conversation: {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      assignedUserId: null,
      assignedInboxTeamId: null,
      additionalAttributes: {},
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
    },
    contactInbox: {
      id: "ci-1",
      contactId: "contact-1",
      channel: "messenger",
    },
    flowVersion: {
      id: "fv-1",
      flowId: "flow-1",
      nodes: [],
      edges: [],
    },
    useLatestFlowVersion: false,
    metadata: {
      type: "broadcast",
      broadcastId: "bc-1",
      contactInboxId: "ci-1",
    },
    targetId: "node-1",
    targetNodeId: "node-1",
    step: {
      id: "step-1",
      stepType: "getUserData" as const,
      message: "Please enter your email",
      replyFormat,
      outputFieldId: "field-1",
      retryMessage: "Please try again",
      skipButtonLabel: "Skip",
      autoSkip: false,
      autoSkipTimeUnit: "hours" as const,
      autoSkipTimeValue: 1,
      autoSkipFailAttempts: 3,
      ...overrides,
    } as GetUserDataStepSchema,
    ctx: {
      variables: {
        conversation: {
          challengeAttempts: { value: attempts },
          challengeLastAttemptAt: { value: lastAttemptAt },
        },
      },
    },
  } as ExecuteStepProps<GetUserDataStepSchema>
}

function makeIncomingMessage(
  overrides: Partial<NonNullable<(typeof lastMessage)["current"]>> = {},
): NonNullable<(typeof lastMessage)["current"]> {
  return {
    text: null,
    contentType: "text",
    contentAttributes: null,
    attachments: [],
    ...overrides,
  }
}

function expectLastInputFailureUpdate(
  lastInputFailure: "timeout" | "invalid_input_attempts" | null,
) {
  expect(contactInboxUpdateTracking).toHaveBeenCalledWith({
    contactInboxId: "ci-1",
    contactId: "contact-1",
    workspaceId: "ws-1",
    data: { lastInputFailure },
  })
}

function expectNoLastInputFailureUpdate() {
  const callsWithLastInputFailure =
    contactInboxUpdateTracking.mock.calls.filter(([update]) =>
      Object.hasOwn(update.data, "lastInputFailure"),
    )

  expect(callsWithLastInputFailure).toHaveLength(0)
}

function expectCustomFieldWrite(value: string) {
  expect(contactCustomFieldSetValueByKey).toHaveBeenCalledWith({
    workspaceId: "ws-1",
    contactId: "contact-1",
    keyword: "field-1",
    value,
  })
}

function challengeClearCalls() {
  return conversationUpdateChallenge.mock.calls.filter(
    ([update]) => update.challenge === undefined,
  )
}

function challengeSetCalls() {
  return conversationUpdateChallenge.mock.calls.filter(
    ([update]) => update.challenge !== undefined,
  )
}

// --- tests ---

describe("getUserData — validation logic", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
    lastMessage.current = null
  })

  test("anchors the message lookup on conversation.lastActivityAt, not contactInbox", async () => {
    lastMessage.current = makeIncomingMessage({ text: "user@example.com" })
    const props = makeProps(ReplyFormat.email)

    await getUserData(props)

    expect(getSafeSinceTime).toHaveBeenCalledWith(
      props.conversation.lastActivityAt,
      365 * 24 * 60 * 60 * 1000,
    )
  })

  describe("email format", () => {
    test("valid email → returns success", async () => {
      lastMessage.current = makeIncomingMessage({ text: "user@example.com" })
      const result = await getUserData(makeProps(ReplyFormat.email))
      expect(result.status).toBe("success")
      expectLastInputFailureUpdate(null)
      expectCustomFieldWrite("user@example.com")
    })

    test("invalid email → returns retry", async () => {
      lastMessage.current = makeIncomingMessage({ text: "not-an-email" })
      const result = await getUserData(makeProps(ReplyFormat.email))
      expect(result.status).toBe("retry")
      expectNoLastInputFailureUpdate()
    })
  })

  describe("number format", () => {
    test("valid number → returns success", async () => {
      lastMessage.current = makeIncomingMessage({ text: "42" })
      const result = await getUserData(makeProps(ReplyFormat.number))
      expect(result.status).toBe("success")
    })

    test("decimal number → returns success", async () => {
      lastMessage.current = makeIncomingMessage({ text: "3.14" })
      const result = await getUserData(makeProps(ReplyFormat.number))
      expect(result.status).toBe("success")
    })

    test("non-numeric text → returns retry", async () => {
      lastMessage.current = makeIncomingMessage({ text: "hello" })
      const result = await getUserData(makeProps(ReplyFormat.number))
      expect(result.status).toBe("retry")
    })
  })

  describe("phone format", () => {
    test("valid phone → returns success", async () => {
      lastMessage.current = makeIncomingMessage({ text: "+1-555-123-4567" })
      const result = await getUserData(makeProps(ReplyFormat.phone))
      expect(result.status).toBe("success")
    })

    test("invalid phone → returns retry", async () => {
      lastMessage.current = makeIncomingMessage({ text: "not-a-phone" })
      const result = await getUserData(makeProps(ReplyFormat.phone))
      expect(result.status).toBe("retry")
    })
  })

  describe("link format", () => {
    test("valid URL → returns success", async () => {
      lastMessage.current = makeIncomingMessage({ text: "https://example.com" })
      const result = await getUserData(makeProps(ReplyFormat.link))
      expect(result.status).toBe("success")
    })

    test("invalid URL → returns retry", async () => {
      lastMessage.current = makeIncomingMessage({ text: "not-a-url" })
      const result = await getUserData(makeProps(ReplyFormat.link))
      expect(result.status).toBe("retry")
    })
  })

  describe("default (free text) format", () => {
    test("any text → returns success", async () => {
      lastMessage.current = makeIncomingMessage({ text: "anything goes" })
      const result = await getUserData(makeProps(ReplyFormat.text))
      expect(result.status).toBe("success")
    })
  })

  describe("attachment formats", () => {
    test("image attachment with image format → returns success", async () => {
      lastMessage.current = makeIncomingMessage({
        text: null,
        attachments: [{ fileType: "image", originPath: "/img.jpg" }],
      })
      const result = await getUserData(makeProps(ReplyFormat.image))
      expect(result.status).toBe("success")
      expectCustomFieldWrite("https://cdn.example.com/img.jpg")
    })

    test("file attachment with file format → returns success", async () => {
      lastMessage.current = makeIncomingMessage({
        text: null,
        attachments: [{ fileType: "file", originPath: "/doc.pdf" }],
      })
      const result = await getUserData(makeProps(ReplyFormat.file))
      expect(result.status).toBe("success")
    })

    test("attachment with text-based format → returns retry even with text", async () => {
      lastMessage.current = makeIncomingMessage({
        text: "user@example.com",
        attachments: [{ fileType: "image", originPath: "/img.jpg" }],
      })
      const result = await getUserData(makeProps(ReplyFormat.email))
      expect(result.status).toBe("retry")
    })

    test("non-image attachment with image format → returns retry even with text", async () => {
      lastMessage.current = makeIncomingMessage({
        text: "caption should not override unsupported attachment",
        attachments: [{ fileType: "video", originPath: "/video.mp4" }],
      })

      const result = await getUserData(makeProps(ReplyFormat.image))

      expect(result.status).toBe("retry")
    })
  })

  describe("any input format", () => {
    test("video attachment → returns success", async () => {
      lastMessage.current = makeIncomingMessage({
        attachments: [{ fileType: "video", originPath: "/video.mp4" }],
      })

      const result = await getUserData(makeProps(ReplyFormat.anyInput))

      expect(result.status).toBe("success")
      // The uploaded attachment is stored as a public URL, not the bare key.
      expectCustomFieldWrite("https://cdn.example.com/video.mp4")
    })

    test("location message → returns success", async () => {
      lastMessage.current = makeIncomingMessage({
        contentType: "location",
        contentAttributes: { latitude: 10.5, longitude: 106.75 },
      })

      const result = await getUserData(makeProps(ReplyFormat.anyInput))

      expect(result.status).toBe("success")
      expectCustomFieldWrite("10.5,106.75")
    })

    test("plain text → returns success", async () => {
      lastMessage.current = makeIncomingMessage({ text: "hello bot" })

      const result = await getUserData(makeProps(ReplyFormat.anyInput))

      expect(result.status).toBe("success")
      expectCustomFieldWrite("hello bot")
    })

    test("empty input → returns retry", async () => {
      lastMessage.current = makeIncomingMessage()

      const result = await getUserData(makeProps(ReplyFormat.anyInput))

      expect(result.status).toBe("retry")
      expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
    })
  })

  describe("no message", () => {
    test("no last message → returns retry", async () => {
      lastMessage.current = null
      const result = await getUserData(makeProps(ReplyFormat.email))
      expect(result.status).toBe("retry")
    })
  })

  test("rethrows typed message storage errors for worker retry", async () => {
    repositoryError.current = new MessageShardUnavailableError("shard down")

    await expect(getUserData(makeProps(ReplyFormat.email))).rejects.toBe(
      repositoryError.current,
    )
    expect(challengeClearCalls()).toHaveLength(0)
  })
})

describe("getUserData — attempt counter (Bug B fix)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
    lastMessage.current = makeIncomingMessage({ text: "invalid-email" })
  })

  function getUpdatedAttempts(): number {
    const update = challengeSetCalls()[0]?.[0]
    expect(update?.challenge).toBeDefined()
    return update?.challenge?.data.attempts ?? 0
  }

  test("increments attempts from 1 to 2 on first retry", async () => {
    await getUserData(makeProps(ReplyFormat.email, {}, 1))
    expect(getUpdatedAttempts()).toBe(2)
  })

  test("increments attempts from 2 to 3 on second retry", async () => {
    await getUserData(makeProps(ReplyFormat.email, {}, 2))
    expect(getUpdatedAttempts()).toBe(3)
  })

  test("re-prompts with retryMessage through the flow message path", async () => {
    await getUserData(
      makeProps(
        ReplyFormat.email,
        { retryMessage: "Please re-enter your email" },
        1,
      ),
    )

    expect(chatQueueAdd).toHaveBeenCalledWith("sendFlowMessage", {
      type: "sendFlowMessage",
      data: expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        flowId: "flow-1",
        flowVersionId: "fv-1",
        metadata: {
          type: "broadcast",
          broadcastId: "bc-1",
          contactInboxId: "ci-1",
        },
        step: expect.objectContaining({
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "Please re-enter your email",
          buttons: [],
        }),
      }),
    })
  })
})

describe("getUserData — auto-skip", () => {
  test("records timeout when skipping after auto-skip time elapses", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
    const result = await getUserData(
      makeProps(
        ReplyFormat.email,
        {
          autoSkip: true,
          autoSkipFailAttempts: 3,
          autoSkipTimeValue: 1,
          autoSkipTimeUnit: "hours" as const,
        },
        1,
        new Date(0),
      ),
    )

    expect(result.status).toBe("skip")
    expectLastInputFailureUpdate("timeout")
  })

  test("skips after exceeding max attempts", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
    const result = await getUserData(
      makeProps(
        ReplyFormat.email,
        {
          autoSkip: true,
          autoSkipFailAttempts: 2,
          autoSkipTimeValue: 24,
          autoSkipTimeUnit: "hours" as const,
        },
        3,
      ),
    )
    expect(result.status).toBe("skip")
    expectLastInputFailureUpdate("invalid_input_attempts")
  })

  test("accepts JSON string timestamps when deciding timeout", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
    const result = await getUserData(
      makeProps(
        ReplyFormat.email,
        {
          autoSkip: true,
          autoSkipFailAttempts: 3,
          autoSkipTimeValue: 1,
          autoSkipTimeUnit: "hours" as const,
        },
        1,
        "2026-01-01T00:00:00.000Z",
      ),
    )

    expect(result.status).toBe("skip")
    expectLastInputFailureUpdate("timeout")
  })
})

describe("getUserData — challenge lifecycle", () => {
  test("clears challenge after successful input", async () => {
    lastMessage.current = makeIncomingMessage({ text: "user@example.com" })

    const result = await getUserData(makeProps(ReplyFormat.email))

    expect(result.status).toBe("success")
    expect(challengeClearCalls()).toHaveLength(1)
  })

  test("clears challenge after auto-skip", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })

    const result = await getUserData(
      makeProps(
        ReplyFormat.email,
        {
          autoSkip: true,
          autoSkipFailAttempts: 1,
          autoSkipTimeValue: 24,
          autoSkipTimeUnit: "hours" as const,
        },
        1,
      ),
    )

    expect(result.status).toBe("skip")
    expect(challengeClearCalls()).toHaveLength(1)
  })

  test("keeps challenge while retrying invalid input", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })

    const result = await getUserData(makeProps(ReplyFormat.email))

    expect(result.status).toBe("retry")
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("clears challenge after terminal non-storage errors", async () => {
    repositoryError.current = new Error("repository failed")

    const result = await getUserData(makeProps(ReplyFormat.email))

    expect(result.status).toBe("error")
    expect(challengeClearCalls()).toHaveLength(1)
  })

  test("clears challenge after first prompt enqueue failure", async () => {
    chatQueueAdd.mockRejectedValueOnce(new Error("queue down"))
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }

    const result = await getUserData(props)

    expect(result.status).toBe("error")
    expect(challengeSetCalls()).toHaveLength(1)
    expect(challengeClearCalls()).toHaveLength(1)
  })
})

describe("getUserData — first send (no challenge state)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
    waitForChatJobCompletion.mockClear()
  })

  test("sends message and returns wait when no challenge active", async () => {
    const props = makeProps(ReplyFormat.email, {
      message: "Please enter your email, {{contact.name}}",
    })
    props.ctx = { variables: { conversation: {} } }
    const result = await getUserData(props)
    expect(result.status).toBe("wait")
    expect(chatQueueAdd).toHaveBeenCalledWith("sendFlowMessage", {
      type: "sendFlowMessage",
      data: {
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        flowId: "flow-1",
        flowVersionId: "fv-1",
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "Please enter your email, {{contact.name}}",
          buttons: [],
        },
        metadata: {
          type: "broadcast",
          broadcastId: "bc-1",
          contactInboxId: "ci-1",
        },
      },
    })
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("writes challenge state through the business layer before the first prompt", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }

    await getUserData(props)

    expect(conversationUpdateChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      challenge: {
        type: "step",
        data: {
          flowId: "flow-1",
          flowVersionId: "fv-1",
          nodeId: "node-1",
          stepId: "step-1",
          attempts: 1,
          lastAttemptAt: expect.any(Date),
        },
      },
    })
  })

  test("uses the latest flow version marker in both challenge and job", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    props.useLatestFlowVersion = true

    await getUserData(props)

    const [, job] = chatQueueAdd.mock.calls[0]
    expect(job.data.flowVersionId).toBeUndefined()
    expect(
      challengeSetCalls()[0]?.[0].challenge?.data.flowVersionId,
    ).toBeUndefined()
  })

  test("writes appointmentId into challenge state and the first prompt job", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    props.appointmentId = "appointment-1"

    await getUserData(props)

    const [, job] = chatQueueAdd.mock.calls[0]
    expect(job.data.appointmentId).toBe("appointment-1")
    expect(challengeSetCalls()[0]?.[0].challenge?.data.appointmentId).toBe(
      "appointment-1",
    )
  })

  test("still uses sendFlowMessage when there is no broadcast metadata", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    props.metadata = undefined

    await getUserData(props)

    const [action, job] = chatQueueAdd.mock.calls[0]
    expect(action).toBe("sendFlowMessage")
    expect(job.data.metadata).toBeUndefined()
  })

  test("writes challenge state before waiting for prompt delivery", async () => {
    const order: string[] = []
    const fakeJob = { waitUntilFinished: vi.fn() }
    conversationUpdateChallenge.mockImplementationOnce(() => {
      order.push("state")
      return Promise.resolve()
    })
    chatQueueAdd.mockImplementationOnce(() => {
      order.push("enqueue")
      return Promise.resolve(fakeJob)
    })
    waitForChatJobCompletion.mockImplementationOnce(() => {
      order.push("wait")
      return Promise.resolve()
    })

    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(order).toEqual(["state", "enqueue", "wait"])
    expect(waitForChatJobCompletion).toHaveBeenCalledWith(fakeJob, {
      conversationId: "conv-1",
      stepId: "step-1",
    })
  })

  test("does not return wait until prompt delivery wait completes", async () => {
    let releaseWait!: () => void
    const waitPromise = new Promise<void>((resolve) => {
      releaseWait = resolve
    })
    chatQueueAdd.mockResolvedValueOnce({ waitUntilFinished: vi.fn() })
    waitForChatJobCompletion.mockReturnValueOnce(waitPromise)

    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    let resolved = false
    const resultPromise = getUserData(props).then((result) => {
      resolved = true
      return result
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(false)

    releaseWait()
    await expect(resultPromise).resolves.toMatchObject({ status: "wait" })
  })
})
