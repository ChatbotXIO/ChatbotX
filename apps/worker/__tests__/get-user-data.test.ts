import { MessageShardUnavailableError } from "@chatbotx.io/database/errors"
import type {
  ContentType,
  ConversationAttributes,
  ConversationStepChallenge,
  FileType,
} from "@chatbotx.io/database/partials"
import { getSafeSinceTime } from "@chatbotx.io/database/repositories"
import { verifyUserDataWebviewToken } from "@chatbotx.io/encryption"
import type { GetUserDataStepSchema } from "@chatbotx.io/flow-config"
import {
  decodeStepInputSkipPostback,
  GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  ReplyFormat,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ExecuteStepProps } from "../src/integration/handlers/flow"
import { logger } from "../src/lib/logger"

// --- mocks ---

const lastMessage: {
  current: {
    text?: string | null
    contentType: ContentType
    contentAttributes?: Record<string, unknown> | null
    attachments: {
      id?: string
      messageCreatedAt?: Date
      fileType: FileType
      originPath: string
    }[]
  } | null
} = { current: null }
const repositoryError: { current: Error | null } = { current: null }
// The message a run names as its trigger; null means "not found".
const triggerMessage: {
  current: NonNullable<(typeof lastMessage)["current"]> | null
} = { current: null }
const findTriggerMessage = vi.fn()

const contactInboxUpdateTracking = vi.fn(async () => undefined)
const contactCustomFieldSetValueByKey = vi.fn(async () => undefined)
const conversationUpdateChallenge = vi.fn(async () => undefined)
const conversationConsumeChallenge = vi.fn(async () => true)
const conversationRestoreChallengeIfAbsent = vi.fn(async () => true)
const conversationAdvanceStepChallengeAttempt = vi.fn(async () => true)
const scheduleSmartDelayResume = vi.fn(async () => undefined)
const workspaceFindById = vi.fn(async () => ({ language: "en" }))
const contactFindById = vi.fn(
  async (): Promise<{ phoneNumber: string | null; email: string | null }> => ({
    phoneNumber: null,
    email: null,
  }),
)
// Pass-through by default: a stored key is returned as-is, like the real helper.
const ensureAttachmentStored = vi.fn(
  async (input: {
    originPath?: string
  }): Promise<{ originPath: string } | null> =>
    input.originPath === undefined ? null : { originPath: input.originPath },
)
const resolveTenantSettings = vi.fn(async () => ({
  storageUrl: "https://cdn.example.com/",
  appUrl: "https://app.example.com",
}))

class MediaNotReadyErrorStub extends Error {}

vi.mock("@chatbotx.io/channel-registry/media-hydration", () => ({
  ensureAttachmentStored,
  MediaNotReadyError: MediaNotReadyErrorStub,
}))

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: {
    setValueByKey: contactCustomFieldSetValueByKey,
  },
  contactInboxService: { updateTracking: contactInboxUpdateTracking },
  contactService: { findById: contactFindById },
  conversationService: {
    updateChallenge: conversationUpdateChallenge,
    consumeChallenge: conversationConsumeChallenge,
    restoreChallengeIfAbsent: conversationRestoreChallengeIfAbsent,
    advanceStepChallengeAttempt: conversationAdvanceStepChallengeAttempt,
  },
  // Real normalizeLanguage collapses to "vi"/"en"/undefined via a supported-
  // language allowlist; the handler only branches on "vi" vs. everything
  // else, so a pass-through is behaviorally equivalent for these tests.
  normalizeLanguage: (language?: string | null) => language ?? undefined,
  resolveTenantSettings,
  workspaceService: { findById: workspaceFindById },
}))

// Attachment values are stored as a public URL; mirror getPublicFileUrl's join
// without loading the real module.
vi.mock("../src/integration/handlers/smart-delay", () => ({
  scheduleSmartDelayResume,
}))

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
    findTriggerMessage: (options: unknown) => {
      findTriggerMessage(options)
      return triggerMessage.current
    },
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
  BROADCAST_SEND_PRIORITY: 5,
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
  triggerMessage.current = null
  findTriggerMessage.mockClear()
  chatQueueAdd.mockResolvedValue({ id: "job-1" })
  waitForChatJobCompletion.mockResolvedValue(undefined)
  contactInboxUpdateTracking.mockClear()
  contactCustomFieldSetValueByKey.mockClear()
  conversationUpdateChallenge.mockClear()
  conversationUpdateChallenge.mockResolvedValue(undefined)
  conversationConsumeChallenge.mockClear()
  conversationConsumeChallenge.mockResolvedValue(true)
  conversationRestoreChallengeIfAbsent.mockClear()
  conversationRestoreChallengeIfAbsent.mockResolvedValue(true)
  conversationAdvanceStepChallengeAttempt.mockClear()
  conversationAdvanceStepChallengeAttempt.mockResolvedValue(true)
  scheduleSmartDelayResume.mockClear()
  scheduleSmartDelayResume.mockResolvedValue(undefined)
  workspaceFindById.mockClear()
  workspaceFindById.mockResolvedValue({ language: "en" })
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
      // Legacy in-flight challenge (no challengeId) by default, mirroring a
      // pre-challengeId production row: consumeCurrentChallenge falls back to
      // the old unconditional clearChallenge behavior for it, so every
      // pre-existing handleSkipOrError test below keeps its prior outcome.
      // Tests exercising the new atomic-claim path override this with a
      // challengeId.
      additionalAttributes: {
        challenge: {
          type: "step",
          data: {
            flowId: "flow-1",
            flowVersionId: "fv-1",
            nodeId: "node-1",
            stepId: "step-1",
            attempts,
            lastAttemptAt: new Date(lastAttemptAt),
          },
        },
      },
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
  lastInputFailure:
    | "timeout"
    | "invalid_input_attempts"
    | "user_skipped"
    | null,
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

function expectCustomFieldWrite(value: string, touchUnchanged = false) {
  expect(contactCustomFieldSetValueByKey).toHaveBeenCalledWith({
    workspaceId: "ws-1",
    contactId: "contact-1",
    keyword: "field-1",
    value,
    allowBotFields: true,
    touchUnchanged,
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

  describe("lazily-ingested attachments", () => {
    const pendingImage = {
      id: "att-1",
      messageCreatedAt: new Date("2026-10-14T01:00:00.000Z"),
      fileType: "image" as const,
      originPath: "https://cdn.fbsbx.example/photo.jpg?sig=abc",
    }

    test("saves the stored object's URL, never the pending provider URL", async () => {
      ensureAttachmentStored.mockResolvedValue({
        originPath: "workspace/messenger/ws-1/int-1/2026/10/14/abc.jpg",
      })
      lastMessage.current = makeIncomingMessage({
        text: null,
        attachments: [pendingImage],
      })

      const result = await getUserData(makeProps(ReplyFormat.image))

      expect(result.status).toBe("success")
      expect(ensureAttachmentStored).toHaveBeenCalledWith({
        attachmentId: "att-1",
        workspaceId: expect.any(String),
        messageCreatedAt: pendingImage.messageCreatedAt,
        originPath: pendingImage.originPath,
      })
      expectCustomFieldWrite(
        "https://cdn.example.com/workspace/messenger/ws-1/int-1/2026/10/14/abc.jpg",
      )
      expect(result.result).toBe(
        "workspace/messenger/ws-1/int-1/2026/10/14/abc.jpg",
      )
    })

    test("re-prompts when the attachment is permanently unavailable", async () => {
      ensureAttachmentStored.mockResolvedValue(null)
      lastMessage.current = makeIncomingMessage({
        text: null,
        attachments: [pendingImage],
      })

      const result = await getUserData(makeProps(ReplyFormat.image))

      expect(result.status).toBe("retry")
      expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
    })

    test("lets the job retry when the attachment is not stored in time", async () => {
      ensureAttachmentStored.mockRejectedValue(
        new MediaNotReadyErrorStub("not ready"),
      )
      lastMessage.current = makeIncomingMessage({
        text: null,
        attachments: [pendingImage],
      })

      await expect(getUserData(makeProps(ReplyFormat.image))).rejects.toThrow(
        "not ready",
      )
      expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
      // The challenge survives so the retried job can still accept the answer.
      expect(conversationConsumeChallenge).not.toHaveBeenCalled()
    })

    test("does not touch storage for text answers", async () => {
      lastMessage.current = makeIncomingMessage({ text: "hello" })

      await getUserData(makeProps(ReplyFormat.text))

      expect(ensureAttachmentStored).not.toHaveBeenCalled()
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

  describe("location format", () => {
    test("location pin → returns success with lat,lng", async () => {
      lastMessage.current = makeIncomingMessage({
        contentType: "location",
        text: "Received location",
        contentAttributes: { latitude: 10.5, longitude: 106.75 },
      })

      const result = await getUserData(makeProps(ReplyFormat.location))

      expect(result.status).toBe("success")
      expectCustomFieldWrite("10.5,106.75", true)
    })

    test("typed coordinate pair → returns success", async () => {
      lastMessage.current = makeIncomingMessage({
        text: "10.5, 106.75",
      })

      const result = await getUserData(makeProps(ReplyFormat.location))

      expect(result.status).toBe("success")
      expectCustomFieldWrite("10.5,106.75", true)
    })

    test("plain text without coordinates → returns retry", async () => {
      lastMessage.current = makeIncomingMessage({ text: "Received location" })

      const result = await getUserData(makeProps(ReplyFormat.location))

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

    expect(chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      {
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
      },
      { priority: 5 },
    )
  })

  test("a blank retry message sends only the question again, never an empty message", async () => {
    await getUserData(makeProps(ReplyFormat.email, { retryMessage: "" }, 1))

    expect(promptTexts()).toEqual(["Please enter your email"])
  })

  test("sends the retry message first, then the question again", async () => {
    await getUserData(
      makeProps(ReplyFormat.email, { retryMessage: "Not a valid email" }, 1),
    )

    expect(promptTexts()).toEqual([
      "Not a valid email",
      "Please enter your email",
    ])
  })

  test("falls back to the step message on date retry so the picker prompt is re-sent with its button", async () => {
    lastMessage.current = makeIncomingMessage({ text: "not a date" })
    await getUserData(
      makeProps(ReplyFormat.date, {
        message: "Pick your date",
        retryMessage: "  ",
      }),
    )

    expect(chatQueueAdd).toHaveBeenCalledWith(
      "sendChatMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          text: "Pick your date",
          quickReplies: [
            expect.objectContaining({ buttonType: "url" }),
            expect.objectContaining({ buttonType: "postback", label: "Skip" }),
          ],
        }),
      }),
    )
    // The blank retry text is not sent on its own.
    expect(promptTexts()).toEqual([])
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

  test("clears the challenge it created after a first prompt enqueue failure", async () => {
    chatQueueAdd.mockRejectedValueOnce(new Error("queue down"))
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }

    const result = await getUserData(props)

    expect(result.status).toBe("error")
    expect(challengeSetCalls()).toHaveLength(1)
    expect(conversationConsumeChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: "test-id" }),
    )
    expect(challengeClearCalls()).toHaveLength(0)
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
    expect(chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      {
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
          presetQuickReplies: [
            {
              id: "test-id",
              label: "Skip",
              buttonType: "postback",
              postback: "STEP_INPUT_SKIP|test-id",
            },
          ],
          metadata: {
            type: "broadcast",
            broadcastId: "bc-1",
            contactInboxId: "ci-1",
          },
        },
      },
      { priority: 5 },
    )
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
          startedAt: expect.any(Date),
          challengeId: "test-id",
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

  test("carries the inbox sender into the first prompt job", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    props.sentByUserId = "user-1"

    await getUserData(props)

    const [, job] = chatQueueAdd.mock.calls[0]
    expect(job.data.sentByUserId).toBe("user-1")
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

// The prompt is this step's outgoing message, so it has to carry the run's
// comment anchor like any other message-producing step. Dropping it meant a
// question-first flow never claimed the single comment_id-anchored DM Meta
// grants per comment, and a question after a `sendText` reached the channel
// with no anchor — so `assertCommentPrivateReplyFollowUpDeliverable` never ran
// and a closed 24-hour window surfaced as an opaque Send API rejection.
describe("getUserData — comment-triggered private reply", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  function promptJobData() {
    return findChatJobCall("sendFlowMessage").data as {
      commentAnchor?: unknown
    }
  }

  test("forwards an unspent anchor, so the channel can send the prompt comment-anchored", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    props.commentAnchor = {
      commentId: "comment-1",
      replyChannel: "private",
    }

    await getUserData(props)

    expect(promptJobData().commentAnchor).toEqual({
      commentId: "comment-1",
      replyChannel: "private",
    })
  })

  test("forwards a spent anchor too, so the follow-up guard can explain a closed window", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    props.commentAnchor = {
      commentId: "comment-1",
      replyChannel: "private",
      spent: true,
    }

    await getUserData(props)

    expect(promptJobData().commentAnchor).toEqual({
      commentId: "comment-1",
      replyChannel: "private",
      spent: true,
    })
  })

  test("forwards a public anchor, so the prompt posts as a comment reply", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    props.commentAnchor = {
      commentId: "comment-1",
      replyChannel: "public",
    }

    await getUserData(props)

    expect(promptJobData().commentAnchor).toEqual({
      commentId: "comment-1",
      replyChannel: "public",
    })
  })

  test("sends no commentAnchor key when the run did not start from a comment", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }

    await getUserData(props)

    expect(Object.hasOwn(promptJobData(), "commentAnchor")).toBe(false)
  })
})

/** Texts of the plain flow-step prompts, in the order they were enqueued. */
function promptTexts(): string[] {
  return chatQueueAdd.mock.calls
    .filter(([action]) => action === "sendFlowMessage")
    .map(
      ([, job]) => (job as { data: { step: { text: string } } }).data.step.text,
    )
}

function findChatJobCall(action: string) {
  const call = chatQueueAdd.mock.calls.find(
    ([callAction]) => callAction === action,
  )
  if (!call) {
    throw new Error(
      `expected chatQueue.add to have been called with "${action}"`,
    )
  }
  return call[1] as {
    type: string
    data: {
      text?: string
      quickReplies?: {
        id: string
        label: string
        buttonType: string
        url?: string
        messengerExtensions?: boolean
        postback?: string
      }[]
    }
  }
}

describe("getUserData — date/datetime webview prompt (RF09/RF10)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  test("date replyFormat sends a url quick reply with the English label by default", async () => {
    const props = makeProps(ReplyFormat.date)
    props.ctx = { variables: { conversation: {} } }
    workspaceFindById.mockResolvedValueOnce({ language: "en" })

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies).toEqual([
      {
        id: "test-id",
        label: "Select Date",
        buttonType: "url",
        url: expect.stringContaining("/extensions/datetime-picker"),
        messengerExtensions: true,
      },
      {
        id: "test-id",
        label: "Skip",
        buttonType: "postback",
        postback: "STEP_INPUT_SKIP|test-id",
      },
    ])
  })

  test("keeps an initial broadcast date prompt in bulk delivery", async () => {
    const props = makeProps(ReplyFormat.date)
    props.isBulkBroadcast = true

    await getUserData(props)

    expect(findChatJobCall("sendChatMessage").data).toMatchObject({
      isBulkBroadcast: true,
    })
  })

  test("uses the Vietnamese label when workspace.language is vi", async () => {
    workspaceFindById.mockResolvedValueOnce({ language: "vi" })
    const props = makeProps(ReplyFormat.datetime)
    props.ctx = { variables: { conversation: {} } }

    await getUserData(props)

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.[0]?.label).toBe("Chọn ngày")
  })

  test("signs a webview token that verifies and carries the challengeId written to the challenge", async () => {
    const props = makeProps(ReplyFormat.date)
    props.ctx = { variables: { conversation: {} } }

    await getUserData(props)

    const job = findChatJobCall("sendChatMessage")
    const url = new URL(job.data.quickReplies?.[0]?.url ?? "")
    const token = url.searchParams.get("token")
    expect(token).toBeTruthy()

    const payload = await verifyUserDataWebviewToken(token as string)
    expect(payload).toMatchObject({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      channel: "messenger",
      flowId: "flow-1",
      flowVersionId: "fv-1",
      stepId: "step-1",
      nodeId: "node-1",
      outputFieldId: "field-1",
      replyFormat: "date",
    })

    const challengeCall = conversationUpdateChallenge.mock.calls[0]?.[0]
    expect(payload.challengeId).toBe(challengeCall?.challenge?.data.challengeId)
  })

  test("writes the challenge state (with challengeId) before the webview prompt", async () => {
    const props = makeProps(ReplyFormat.datetime)
    props.ctx = { variables: { conversation: {} } }

    await getUserData(props)

    expect(conversationUpdateChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      challenge: {
        type: "step",
        data: expect.objectContaining({
          stepId: "step-1",
          challengeId: "test-id",
        }),
      },
    })
  })

  test("does not use the text-prompt (sendFlowMessage) path for date/datetime", async () => {
    const props = makeProps(ReplyFormat.date)
    props.ctx = { variables: { conversation: {} } }

    await getUserData(props)

    expect(chatQueueAdd).not.toHaveBeenCalledWith(
      "sendFlowMessage",
      expect.anything(),
    )
  })

  test("reuses the existing challengeId from the conversation's current challenge on retry", async () => {
    lastMessage.current = makeIncomingMessage({ text: "not-a-date" })
    const props = makeProps(ReplyFormat.date, {}, 1)
    props.conversation = {
      ...props.conversation,
      additionalAttributes: {
        challenge: {
          type: "step",
          data: {
            flowId: "flow-1",
            flowVersionId: "fv-1",
            nodeId: "node-1",
            stepId: "step-1",
            attempts: 1,
            lastAttemptAt: new Date(),
            challengeId: "existing-challenge-id",
          },
        },
      },
    }

    await getUserData(props)

    // A challenge that already has an id advances through the compare-and-set
    // and keeps that id, so the earlier webview link stays valid.
    expect(conversationAdvanceStepChallengeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "step-1",
        challengeId: "existing-challenge-id",
        fromAttempts: 1,
        toAttempts: 2,
      }),
    )
    expect(conversationUpdateChallenge).not.toHaveBeenCalled()

    const job = findChatJobCall("sendChatMessage")
    const url = new URL(job.data.quickReplies?.[0]?.url ?? "")
    const token = url.searchParams.get("token") as string
    const payload = await verifyUserDataWebviewToken(token)
    expect(payload.challengeId).toBe("existing-challenge-id")
  })
})

describe("getUserData — webview submission (RF09/RF10)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  function makeWebviewSubmissionProps(challengeId = "test-id") {
    const props = makeProps(ReplyFormat.date)
    props.metadata = {
      type: GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE,
      stepId: "step-1",
      challengeId,
      selectedValue: "2026-08-21T00:00:00.000Z",
    }
    return props
  }

  test("claims the challenge and saves the selected value on success", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(true)
    const props = makeWebviewSubmissionProps()

    const result = await getUserData(props)

    expect(conversationConsumeChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "test-id",
    })
    expect(result).toEqual({
      result: "2026-08-21T00:00:00.000Z",
      status: "success",
    })
    expectCustomFieldWrite("2026-08-21T00:00:00.000Z")
    expectLastInputFailureUpdate(null)
    // consumeChallenge already cleared the challenge atomically — the
    // handler must not issue a separate updateChallenge(undefined) clear.
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("duplicate submission (challenge already consumed) is a no-op", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(false)
    const props = makeWebviewSubmissionProps()

    const result = await getUserData(props)

    expect(result).toEqual({ result: undefined, status: "wait" })
    expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
    expect(contactInboxUpdateTracking).not.toHaveBeenCalled()
  })

  test("stale challengeId from a previous challenge cycle is a no-op", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(false)
    const props = makeWebviewSubmissionProps("stale-challenge-id")

    const result = await getUserData(props)

    expect(conversationConsumeChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: "stale-challenge-id" }),
    )
    expect(result.status).toBe("wait")
    expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
  })

  test("metadata for a different step falls through to the normal flow instead of claiming", async () => {
    const props = makeWebviewSubmissionProps()
    props.metadata = { ...props.metadata, stepId: "other-step" }
    props.ctx = { variables: { conversation: {} } }

    await getUserData(props)

    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
  })
})

describe("getUserData — webview submission side-effect failure (crash-safety, Fix 1)", () => {
  function makeWebviewSubmissionProps(challengeId = "test-id") {
    const props = makeProps(ReplyFormat.date)
    props.metadata = {
      type: GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE,
      stepId: "step-1",
      challengeId,
      selectedValue: "2026-08-21T00:00:00.000Z",
    }
    return props
  }

  test("restores the challenge (same challengeId) and waits (flow does not continue) when a side effect fails after the claim", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(true)
    contactCustomFieldSetValueByKey.mockRejectedValueOnce(
      new Error("field write failed"),
    )
    const props = makeWebviewSubmissionProps("test-id")

    const result = await getUserData(props)

    // No unhandled rejection: the promise resolves with a "wait" result
    // rather than throwing.
    expect(result.status).toBe("wait")
    expect(result.result).toBeUndefined()

    // Restored with the SAME challengeId that was just claimed, so the
    // contact's existing webview link/token can resubmit successfully. The
    // restore must go through the conditional restoreChallengeIfAbsent (a
    // plain updateChallenge could overwrite a newer challenge started
    // between the claim and the restore).
    expect(conversationRestoreChallengeIfAbsent).toHaveBeenCalledTimes(1)
    expect(
      conversationRestoreChallengeIfAbsent.mock.calls[0]?.[0],
    ).toMatchObject({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      challenge: {
        type: "step",
        data: expect.objectContaining({
          stepId: "step-1",
          challengeId: "test-id",
        }),
      },
    })
    expect(conversationUpdateChallenge).not.toHaveBeenCalled()

    // getUserData's outer catch must NOT also unconditionally clear the
    // challenge — that would erase the restore above and strand the contact.
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("restores the challenge when updateTracking itself fails (not just the custom-field write)", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(true)
    contactInboxUpdateTracking.mockRejectedValueOnce(
      new Error("tracking failed"),
    )
    const props = makeWebviewSubmissionProps("test-id")

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(conversationRestoreChallengeIfAbsent).toHaveBeenCalledTimes(1)
  })

  test("tolerates a skipped restore (a newer challenge already exists) and still returns error", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(true)
    contactCustomFieldSetValueByKey.mockRejectedValueOnce(
      new Error("field write failed"),
    )
    conversationRestoreChallengeIfAbsent.mockResolvedValueOnce(false)
    const props = makeWebviewSubmissionProps("test-id")

    const result = await getUserData(props)

    expect(result.status).toBe("error")
    // The newer challenge must be left untouched — no unconditional write.
    expect(conversationUpdateChallenge).not.toHaveBeenCalled()
  })
})

describe("getUserData — challenge claim race, manual reply vs webview submit (Fix 2)", () => {
  beforeEach(() => {
    lastMessage.current = makeIncomingMessage({ text: "user@example.com" })
  })

  function withChallengeId(
    props: ExecuteStepProps<GetUserDataStepSchema>,
    challengeId: string,
  ): ExecuteStepProps<GetUserDataStepSchema> {
    const existing = (
      props.conversation.additionalAttributes as
        | ConversationAttributes
        | undefined
    )?.challenge
    props.conversation = {
      ...props.conversation,
      additionalAttributes: {
        challenge: {
          type: "step",
          data: { ...existing?.data, challengeId },
        },
      },
    }
    return props
  }

  test("calls consumeChallenge (not clearChallenge) when the current challenge carries a challengeId", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(true)
    const props = withChallengeId(makeProps(ReplyFormat.email), "challenge-xyz")

    const result = await getUserData(props)

    expect(conversationConsumeChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "challenge-xyz",
    })
    expect(challengeClearCalls()).toHaveLength(0)
    expect(result.status).toBe("success")
  })

  test("loses the claim race to a concurrent webview submit → wait, not success", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(false)
    const props = withChallengeId(makeProps(ReplyFormat.email), "challenge-xyz")

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
  })

  test("legacy challenge (no challengeId) still uses the old unconditional clearChallenge — success (regression)", async () => {
    // makeProps' default fixture already carries a legacy (no challengeId)
    // challenge.
    const props = makeProps(ReplyFormat.email)

    const result = await getUserData(props)

    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
    expect(challengeClearCalls()).toHaveLength(1)
    expect(result.status).toBe("success")
  })
})

describe("getUserData — autoSkip challenge claim race (Fix 2)", () => {
  function autoSkipProps(
    challengeId?: string,
  ): ExecuteStepProps<GetUserDataStepSchema> {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
    const props = makeProps(
      ReplyFormat.email,
      {
        autoSkip: true,
        autoSkipFailAttempts: 1,
        autoSkipTimeValue: 24,
        autoSkipTimeUnit: "hours" as const,
      },
      1,
    )
    if (!challengeId) {
      return props
    }
    const existing = (
      props.conversation.additionalAttributes as
        | ConversationAttributes
        | undefined
    )?.challenge
    props.conversation = {
      ...props.conversation,
      additionalAttributes: {
        challenge: {
          type: "step",
          data: { ...existing?.data, challengeId },
        },
      },
    }
    return props
  }

  test("claim wins → skip (regression)", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(true)
    const props = autoSkipProps("challenge-abc")

    const result = await getUserData(props)

    expect(result.status).toBe("skip")
  })

  test("claim lost to a concurrent terminator → wait instead of skip", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(false)
    const props = autoSkipProps("challenge-abc")

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
  })
})

describe("getUserData — date/datetime webview channel gating (Fix 3)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  test("whatsapp is not URL-quick-reply capable — falls through to the plain-text prompt", async () => {
    const props = makeProps(ReplyFormat.date)
    props.ctx = { variables: { conversation: {} } }
    props.contactInbox = { ...props.contactInbox, channel: "whatsapp" }

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      expect.objectContaining({ type: "sendFlowMessage" }),
      { priority: 5 },
    )
    expect(chatQueueAdd).not.toHaveBeenCalledWith(
      "sendChatMessage",
      expect.anything(),
    )
  })

  test("messenger is URL-quick-reply capable — still gets the url quick reply (regression)", async () => {
    const props = makeProps(ReplyFormat.date)
    props.ctx = { variables: { conversation: {} } }
    props.contactInbox = { ...props.contactInbox, channel: "messenger" }

    await getUserData(props)

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.[0]?.buttonType).toBe("url")
  })
})

describe("getUserData — non-date replyFormats keep the text prompt path (regression)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  test("text replyFormat still enqueues via enqueueFlowStepMessage / sendFlowMessage", async () => {
    const props = makeProps(ReplyFormat.text)
    props.ctx = { variables: { conversation: {} } }

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      expect.objectContaining({ type: "sendFlowMessage" }),
      { priority: 5 },
    )
    expect(chatQueueAdd).not.toHaveBeenCalledWith(
      "sendChatMessage",
      expect.anything(),
    )
  })
})

describe("getUserData — WhatsApp native location request (RF08)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  test("whatsapp location format sends the reserved native location-request marker", async () => {
    const props = makeProps(ReplyFormat.location, {
      message: "Please share your location",
    })
    props.ctx = { variables: { conversation: {} } }
    props.contactInbox = { ...props.contactInbox, channel: "whatsapp" }

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    const job = findChatJobCall("sendChatMessage")
    expect(job.data).toMatchObject({
      text: "Please share your location",
      quickReplies: [
        {
          id: "whatsapp:native:location_request",
          label: "Send location",
          buttonType: "postback",
          postback: "whatsapp:native:location_request",
        },
      ],
    })
    expect(waitForChatJobCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1" }),
      { conversationId: "conv-1", stepId: "step-1" },
    )
  })

  test("sends the Skip button as its own message after the native request, with the author's label as its text", async () => {
    const props = makeProps(ReplyFormat.location, {
      message: "Please share your location",
      skipButtonLabel: "Bỏ qua bước này",
    })
    props.ctx = { variables: { conversation: {} } }
    props.contactInbox = { ...props.contactInbox, channel: "whatsapp" }

    await getUserData(props)

    expect(chatQueueAdd.mock.calls.map(([action]) => action)).toEqual([
      "sendChatMessage",
      "sendFlowMessage",
    ])
    const companion = findChatJobCall("sendFlowMessage") as unknown as {
      data: {
        step: { text: string }
        presetQuickReplies: { label: string; postback: string }[]
      }
    }
    expect(companion.data.step.text).toBe("Bỏ qua bước này")
    expect(companion.data.presetQuickReplies).toEqual([
      expect.objectContaining({
        label: "Bỏ qua bước này",
        postback: "STEP_INPUT_SKIP|test-id",
      }),
    ])
  })

  test("sends no companion message when the Skip label is blank", async () => {
    const props = makeProps(ReplyFormat.location, { skipButtonLabel: "  " })
    props.ctx = { variables: { conversation: {} } }
    props.contactInbox = { ...props.contactInbox, channel: "whatsapp" }

    await getUserData(props)

    expect(chatQueueAdd.mock.calls.map(([action]) => action)).toEqual([
      "sendChatMessage",
    ])
  })

  test("uses the Vietnamese inbox label when workspace.language is vi", async () => {
    workspaceFindById.mockResolvedValueOnce({ language: "vi" })
    const props = makeProps(ReplyFormat.location)
    props.ctx = { variables: { conversation: {} } }
    props.contactInbox = { ...props.contactInbox, channel: "whatsapp" }

    await getUserData(props)

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.[0]?.label).toBe("Gửi vị trí")
  })

  test("non-whatsapp location format keeps the text prompt path", async () => {
    const props = makeProps(ReplyFormat.location)
    props.ctx = { variables: { conversation: {} } }
    props.contactInbox = { ...props.contactInbox, channel: "messenger" }

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      expect.objectContaining({ type: "sendFlowMessage" }),
      { priority: 5 },
    )
    expect(chatQueueAdd).not.toHaveBeenCalledWith(
      "sendChatMessage",
      expect.anything(),
    )
  })
})

describe("getUserData — Show Hint contact quick reply (phone/email)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
    waitForChatJobCompletion.mockClear()
    contactFindById.mockReset()
    contactFindById.mockResolvedValue({ phoneNumber: null, email: null })
  })

  function makeFirstSendProps(
    replyFormat: ReplyFormat,
    channel: string,
    overrides: StepOverride = { showHint: true },
  ) {
    const props = makeProps(replyFormat, overrides)
    props.ctx = { variables: { conversation: {} } }
    props.contactInbox = { ...props.contactInbox, channel }
    return props
  }

  function expectTextPromptPath() {
    expect(chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      expect.objectContaining({ type: "sendFlowMessage" }),
      { priority: 5 },
    )
    expect(chatQueueAdd).not.toHaveBeenCalledWith(
      "sendChatMessage",
      expect.anything(),
    )
  }

  test("messenger offers the stored contact phone with the full value in the payload", async () => {
    contactFindById.mockResolvedValueOnce({
      phoneNumber: "0708122593",
      email: null,
    })

    const result = await getUserData(
      makeFirstSendProps(ReplyFormat.phone, "messenger"),
    )

    expect(result.status).toBe("wait")
    expect(contactFindById).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies).toEqual([
      {
        id: "test-id",
        label: "0708122593",
        buttonType: "postback",
        postback: "GET_USER_DATA_CONTACT_HINT|0708122593",
      },
      {
        id: "test-id",
        label: "Skip",
        buttonType: "postback",
        postback: "STEP_INPUT_SKIP|test-id",
      },
    ])
    expect(waitForChatJobCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1" }),
      { conversationId: "conv-1", stepId: "step-1" },
    )
  })

  test("a value longer than 20 characters gets a shortened title and the full payload", async () => {
    contactFindById.mockResolvedValueOnce({
      phoneNumber: null,
      email: "taubancam171995.1@gmail.com",
    })

    await getUserData(makeFirstSendProps(ReplyFormat.email, "messenger"))

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.[0]).toMatchObject({
      label: "taubancam171995.1@g…",
      postback: "GET_USER_DATA_CONTACT_HINT|taubancam171995.1@gmail.com",
    })
    expect(job.data.quickReplies?.[0]?.label).toHaveLength(20)
  })

  test("messenger without a stored phone falls back to the native user_phone_number quick reply", async () => {
    await getUserData(makeFirstSendProps(ReplyFormat.phone, "messenger"))

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies).toEqual([
      {
        id: "messenger:native-quick-reply:user_phone_number",
        label: "Phone",
        buttonType: "postback",
        postback: "messenger:native-quick-reply:user_phone_number",
      },
      {
        id: "test-id",
        label: "Skip",
        buttonType: "postback",
        postback: "STEP_INPUT_SKIP|test-id",
      },
    ])
  })

  test("messenger without a stored email falls back to the native user_email quick reply", async () => {
    await getUserData(makeFirstSendProps(ReplyFormat.email, "messenger"))

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.[0]?.postback).toBe(
      "messenger:native-quick-reply:user_email",
    )
  })

  test("instagram offers the stored contact value", async () => {
    contactFindById.mockResolvedValueOnce({
      phoneNumber: null,
      email: "an@example.com",
    })

    await getUserData(makeFirstSendProps(ReplyFormat.email, "instagram"))

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.[0]).toMatchObject({
      label: "an@example.com",
      postback: "GET_USER_DATA_CONTACT_HINT|an@example.com",
    })
  })

  test("messenger with an invalid stored phone falls back to the native quick reply", async () => {
    contactFindById.mockResolvedValueOnce({
      phoneNumber: "call me maybe",
      email: null,
    })

    await getUserData(makeFirstSendProps(ReplyFormat.phone, "messenger"))

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.[0]?.postback).toBe(
      "messenger:native-quick-reply:user_phone_number",
    )
  })

  test("instagram with an invalid stored email keeps the text prompt path", async () => {
    contactFindById.mockResolvedValueOnce({
      phoneNumber: null,
      email: "not-an-email",
    })

    await getUserData(makeFirstSendProps(ReplyFormat.email, "instagram"))

    expectTextPromptPath()
  })

  test("trims the stored value before offering it", async () => {
    contactFindById.mockResolvedValueOnce({
      phoneNumber: "  0708122593  ",
      email: null,
    })

    await getUserData(makeFirstSendProps(ReplyFormat.phone, "instagram"))

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.[0]).toMatchObject({
      label: "0708122593",
      postback: "GET_USER_DATA_CONTACT_HINT|0708122593",
    })
  })

  test("a comment-triggered run keeps the text prompt path", async () => {
    contactFindById.mockResolvedValueOnce({
      phoneNumber: "0708122593",
      email: null,
    })
    const props = makeFirstSendProps(ReplyFormat.phone, "messenger")
    props.commentAnchor = {
      commentId: "comment-1",
      replyChannel: "private",
    }

    await getUserData(props)

    expect(contactFindById).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalledWith(
      "sendChatMessage",
      expect.anything(),
    )
  })

  test("instagram without a stored value keeps the text prompt path", async () => {
    await getUserData(makeFirstSendProps(ReplyFormat.phone, "instagram"))

    expectTextPromptPath()
  })

  test.each([
    "whatsapp",
    "zalo",
    "telegram",
    "tiktok",
    "webchat",
  ])("%s keeps the text prompt path", async (channel) => {
    await getUserData(makeFirstSendProps(ReplyFormat.phone, channel))

    expectTextPromptPath()
  })

  test("showHint off keeps the text prompt path", async () => {
    await getUserData(
      makeFirstSendProps(ReplyFormat.phone, "messenger", { showHint: false }),
    )

    expectTextPromptPath()
  })

  test("showHint is ignored for non phone/email formats", async () => {
    await getUserData(makeFirstSendProps(ReplyFormat.text, "messenger"))

    expectTextPromptPath()
  })
})

// --- Auto Skip timer, Skip button, resolution (plan phases 3-4) ---

const HOUR_MS = 3_600_000

type StepChallengeData = ConversationStepChallenge["data"]

function withStepChallenge(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  data: Partial<StepChallengeData>,
): ExecuteStepProps<GetUserDataStepSchema> {
  props.conversation = {
    ...props.conversation,
    additionalAttributes: {
      challenge: {
        type: "step",
        data: {
          flowId: "flow-1",
          flowVersionId: "fv-1",
          nodeId: "node-1",
          stepId: "step-1",
          attempts: 1,
          lastAttemptAt: new Date(),
          ...data,
        },
      },
    },
  }
  return props
}

function makeFreshFirstSendProps(overrides: StepOverride = {}) {
  const props = makeProps(ReplyFormat.email, overrides)
  props.conversation = { ...props.conversation, additionalAttributes: {} }
  props.ctx = { variables: { conversation: {} } }
  return props
}

describe("getUserData — Auto Skip timer", () => {
  const autoSkipOverrides: StepOverride = {
    autoSkip: true,
    autoSkipTimeValue: 1,
    autoSkipTimeUnit: "hours",
  }

  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  test("arms one timer from the first prompt, carrying the challenge id for the claim", async () => {
    await getUserData(makeFreshFirstSendProps(autoSkipOverrides))

    expect(scheduleSmartDelayResume).toHaveBeenCalledTimes(1)
    const [timer] = scheduleSmartDelayResume.mock.calls[0] as unknown as [
      { triggerAt: Date } & Record<string, unknown>,
    ]
    expect(timer).toMatchObject({
      type: "stepInputTimeout",
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
        challengeId: "test-id",
        reason: "timeout",
      },
    })
    const startedAt = challengeSetCalls()[0]?.[0].challenge?.data
      .startedAt as Date
    expect(timer.triggerAt.getTime() - startedAt.getTime()).toBe(HOUR_MS)
  })

  test("honours the configured unit (seconds)", async () => {
    await getUserData(
      makeFreshFirstSendProps({
        ...autoSkipOverrides,
        autoSkipTimeValue: 30,
        autoSkipTimeUnit: "seconds",
      }),
    )

    const [timer] = scheduleSmartDelayResume.mock.calls[0] as unknown as [
      { triggerAt: Date },
    ]
    const startedAt = challengeSetCalls()[0]?.[0].challenge?.data
      .startedAt as Date
    expect(timer.triggerAt.getTime() - startedAt.getTime()).toBe(30_000)
  })

  test("pins no flow version when the run follows the latest one", async () => {
    const props = makeFreshFirstSendProps(autoSkipOverrides)
    props.useLatestFlowVersion = true

    await getUserData(props)

    expect(scheduleSmartDelayResume.mock.calls[0]?.[0]).toMatchObject({
      flowVersionId: null,
    })
  })

  test("carries the appointment so the resumed run keeps it", async () => {
    const props = makeFreshFirstSendProps(autoSkipOverrides)
    props.appointmentId = "appointment-1"

    await getUserData(props)

    expect(scheduleSmartDelayResume.mock.calls[0]?.[0]).toMatchObject({
      appointmentId: "appointment-1",
    })
  })

  test("arms no timer when Auto Skip is off", async () => {
    await getUserData(makeFreshFirstSendProps({ autoSkip: false }))

    expect(scheduleSmartDelayResume).not.toHaveBeenCalled()
  })

  test("a retry never re-arms the timer (the deadline stays at the first prompt)", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })

    const result = await getUserData(
      withStepChallenge(makeProps(ReplyFormat.email, autoSkipOverrides, 1), {
        challengeId: "challenge-1",
      }),
    )

    expect(result.status).toBe("retry")
    expect(scheduleSmartDelayResume).not.toHaveBeenCalled()
  })

  test("writes the challenge before arming the timer and arms it before the prompt", async () => {
    const order: string[] = []
    conversationUpdateChallenge.mockImplementationOnce(() => {
      order.push("challenge")
      return Promise.resolve()
    })
    scheduleSmartDelayResume.mockImplementationOnce(() => {
      order.push("timer")
      return Promise.resolve()
    })
    chatQueueAdd.mockImplementationOnce(() => {
      order.push("prompt")
      return Promise.resolve({ id: "job-1" })
    })

    await getUserData(
      makeFreshFirstSendProps({
        ...autoSkipOverrides,
        autoSkipTimeValue: 1,
        autoSkipTimeUnit: "seconds",
      }),
    )

    expect(order).toEqual(["challenge", "timer", "prompt"])
  })

  test("when arming the timer fails, no prompt is sent and the challenge is cleared", async () => {
    scheduleSmartDelayResume.mockRejectedValueOnce(new Error("db down"))

    const result = await getUserData(makeFreshFirstSendProps(autoSkipOverrides))

    expect(result.status).toBe("error")
    expect(chatQueueAdd).not.toHaveBeenCalled()
    expect(conversationConsumeChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: "test-id" }),
    )
  })

  test("reuses the id of this step's pending challenge, but never another step's", async () => {
    const sameStep = makeFreshFirstSendProps(autoSkipOverrides)
    withStepChallenge(sameStep, { challengeId: "same-step-id" })
    await getUserData(sameStep)
    expect(challengeSetCalls()[0]?.[0].challenge?.data.challengeId).toBe(
      "same-step-id",
    )

    conversationUpdateChallenge.mockClear()
    const otherStep = makeFreshFirstSendProps(autoSkipOverrides)
    withStepChallenge(otherStep, {
      stepId: "other-step",
      challengeId: "other-step-id",
    })
    await getUserData(otherStep)
    expect(challengeSetCalls()[0]?.[0].challenge?.data.challengeId).toBe(
      "test-id",
    )
  })
})

describe("getUserData — Auto Skip deadline", () => {
  const autoSkipOverrides: StepOverride = {
    autoSkip: true,
    autoSkipFailAttempts: 5,
    autoSkipTimeValue: 1,
    autoSkipTimeUnit: "hours",
  }

  beforeEach(() => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
  })

  function withStartedAt(
    props: ExecuteStepProps<GetUserDataStepSchema>,
    startedAt: Date,
  ) {
    props.ctx = {
      variables: {
        conversation: {
          ...props.ctx?.variables.conversation,
          challengeStartedAt: { value: startedAt },
        },
      },
    } as ExecuteStepProps<GetUserDataStepSchema>["ctx"]
    return props
  }

  test("counts from the first prompt: a retry that just happened does not restart the clock", async () => {
    const props = withStartedAt(
      makeProps(ReplyFormat.email, autoSkipOverrides, 2, new Date()),
      new Date(Date.now() - 2 * HOUR_MS),
    )

    const result = await getUserData(props)

    expect(result.status).toBe("skip")
    expectLastInputFailureUpdate("timeout")
  })

  test("a challenge without startedAt keeps counting from the last attempt", async () => {
    const result = await getUserData(
      makeProps(ReplyFormat.email, autoSkipOverrides, 2, new Date()),
    )

    expect(result.status).toBe("retry")
  })

  test("a deadline still in the future does not skip", async () => {
    const props = withStartedAt(
      makeProps(ReplyFormat.email, autoSkipOverrides, 2, new Date()),
      new Date(Date.now() - HOUR_MS / 2),
    )

    const result = await getUserData(props)

    expect(result.status).toBe("retry")
  })
})

describe("getUserData — input resolution (timer or Skip button)", () => {
  function makeResolutionProps(
    reason: string,
    stepOverrides: StepOverride = {},
    challengeId = "challenge-1",
  ) {
    const lastAttemptAt = new Date()
    const props = withStepChallenge(
      makeProps(ReplyFormat.email, stepOverrides, 2, lastAttemptAt),
      { attempts: 2, lastAttemptAt, challengeId },
    )
    props.ctx = {
      variables: {
        conversation: {
          challengeAttempts: { value: 2 },
          challengeLastAttemptAt: { value: lastAttemptAt },
          challengeId: { value: challengeId },
          challengeResolution: { value: reason },
        },
      },
    } as ExecuteStepProps<GetUserDataStepSchema>["ctx"]
    return props
  }

  beforeEach(() => {
    chatQueueAdd.mockClear()
    lastMessage.current = makeIncomingMessage({ text: "ignored" })
  })

  test("a timeout takes the Skip branch: claims the challenge, then records the timeout", async () => {
    const result = await getUserData(
      makeResolutionProps("timeout", { autoSkip: true }),
    )

    expect(result).toEqual({ result: undefined, status: "skip" })
    expect(conversationConsumeChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "challenge-1",
    })
    expectLastInputFailureUpdate("timeout")
    expect(
      conversationConsumeChallenge.mock.invocationCallOrder[0],
    ).toBeLessThan(contactInboxUpdateTracking.mock.invocationCallOrder[0] ?? 0)
  })

  test("a Skip tap takes the Skip branch and records user_skipped", async () => {
    const result = await getUserData(makeResolutionProps("user_skipped"))

    expect(result.status).toBe("skip")
    expectLastInputFailureUpdate("user_skipped")
  })

  test("never reads or saves the contact's last reply", async () => {
    await getUserData(makeResolutionProps("user_skipped"))

    expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalled()
  })

  test("ignores a timeout when the step no longer has Auto Skip on (flow edited)", async () => {
    const result = await getUserData(
      makeResolutionProps("timeout", { autoSkip: false }),
    )

    expect(result.status).toBe("wait")
    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
    expect(contactInboxUpdateTracking).not.toHaveBeenCalled()
  })

  test("ignores a Skip tap when the step no longer has a Skip button", async () => {
    const result = await getUserData(
      makeResolutionProps("user_skipped", { skipButtonLabel: "  " }),
    )

    expect(result.status).toBe("wait")
    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
  })

  test("losing the claim (the contact answered first) writes nothing and waits", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(false)

    const result = await getUserData(
      makeResolutionProps("timeout", { autoSkip: true }),
    )

    expect(result.status).toBe("wait")
    expect(contactInboxUpdateTracking).not.toHaveBeenCalled()
  })

  test("a timeout still takes the Skip branch when recording fails: no contact is left to retry it", async () => {
    contactInboxUpdateTracking.mockRejectedValueOnce(new Error("tracking down"))

    const result = await getUserData(
      makeResolutionProps("timeout", { autoSkip: true }),
    )

    expect(result).toEqual({ result: undefined, status: "skip" })
    expect(conversationRestoreChallengeIfAbsent).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "timeout" }),
      expect.stringContaining("taking the Skip branch anyway"),
    )
  })

  test("restores the challenge, with its attempts and deadline origin, when recording fails after the claim", async () => {
    contactInboxUpdateTracking.mockRejectedValueOnce(new Error("tracking down"))
    const props = makeResolutionProps("user_skipped")
    const startedAt = new Date(Date.now() - HOUR_MS)
    withStepChallenge(props, {
      attempts: 2,
      challengeId: "challenge-1",
      startedAt,
    })

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(
      conversationRestoreChallengeIfAbsent.mock.calls[0]?.[0],
    ).toMatchObject({
      challenge: {
        type: "step",
        data: { challengeId: "challenge-1", attempts: 2, startedAt },
      },
    })
    // The outer catch must not erase the restore.
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test.each([
    [true, 1],
    [false, 0],
  ])("a restored challenge re-arms its timer on the original deadline (autoSkip %s)", async (autoSkip, armCalls) => {
    contactInboxUpdateTracking.mockRejectedValueOnce(new Error("tracking down"))
    const props = makeResolutionProps("user_skipped", {
      autoSkip,
      autoSkipTimeUnit: "minutes",
      autoSkipTimeValue: 3,
    })
    const startedAt = new Date(Date.now() - HOUR_MS)
    withStepChallenge(props, {
      attempts: 2,
      challengeId: "challenge-1",
      startedAt,
    })
    scheduleSmartDelayResume.mockClear()

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(scheduleSmartDelayResume).toHaveBeenCalledTimes(armCalls)
    if (armCalls > 0) {
      expect(scheduleSmartDelayResume).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerAt: new Date(startedAt.getTime() + 3 * 60 * 1000),
          metadata: expect.objectContaining({ challengeId: "challenge-1" }),
        }),
      )
    }
  })

  test("a failed re-arm still reports the restored challenge as waiting", async () => {
    contactInboxUpdateTracking.mockRejectedValueOnce(new Error("tracking down"))
    scheduleSmartDelayResume.mockRejectedValueOnce(new Error("db down"))
    const props = makeResolutionProps("user_skipped", { autoSkip: true })
    withStepChallenge(props, {
      attempts: 2,
      challengeId: "challenge-1",
      startedAt: new Date(),
    })

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
  })

  test("a resolution aimed at another step is not consumed by this one", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
    const props = makeResolutionProps("user_skipped")
    withStepChallenge(props, { stepId: "other-step", challengeId: "c-2" })

    const result = await getUserData(props)

    // Not consumed as a resolution: nothing recorded, nothing claimed. The
    // other step owns the challenge now, so this reply just waits.
    expect(result.status).toBe("wait")
    expectNoLastInputFailureUpdate()
    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
  })

  test("a run without a resolution (a flow that loops back to the step) asks the question again", async () => {
    const props = makeFreshFirstSendProps({ autoSkip: true })

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(promptTexts()).toEqual(["Please enter your email"])
  })
})

describe("getUserData — claim first: a reply that loses writes nothing", () => {
  beforeEach(() => {
    lastMessage.current = makeIncomingMessage({ text: "user@example.com" })
  })

  test("a valid reply that lost to the timeout saves no field and clears no failure", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(false)

    const result = await getUserData(
      withStepChallenge(makeProps(ReplyFormat.email), {
        challengeId: "challenge-1",
      }),
    )

    expect(result.status).toBe("wait")
    expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
    expect(contactInboxUpdateTracking).not.toHaveBeenCalled()
  })

  test("a valid reply never clears another step's id-less challenge (the job's snapshot is stale)", async () => {
    const props = withStepChallenge(makeProps(ReplyFormat.email), {
      stepId: "other-step",
    })

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(challengeClearCalls()).toHaveLength(0)
    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
    expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
  })

  test("nor does an auto skip", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
    const props = withStepChallenge(
      makeProps(
        ReplyFormat.email,
        { autoSkip: true, autoSkipFailAttempts: 1 },
        1,
      ),
      { stepId: "other-step" },
    )

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(challengeClearCalls()).toHaveLength(0)
    expect(contactInboxUpdateTracking).not.toHaveBeenCalled()
  })

  test("a valid reply claims the challenge before it writes the field", async () => {
    await getUserData(
      withStepChallenge(makeProps(ReplyFormat.email), {
        challengeId: "challenge-1",
      }),
    )

    expect(
      conversationConsumeChallenge.mock.invocationCallOrder[0],
    ).toBeLessThan(
      contactCustomFieldSetValueByKey.mock.invocationCallOrder[0] ?? 0,
    )
    expectCustomFieldWrite("user@example.com")
  })

  test("restores the challenge instead of clearing it when the field write fails after the claim", async () => {
    contactCustomFieldSetValueByKey.mockRejectedValueOnce(
      new Error("field write failed"),
    )

    const result = await getUserData(
      withStepChallenge(makeProps(ReplyFormat.email), {
        challengeId: "challenge-1",
      }),
    )

    expect(result.status).toBe("wait")
    expect(
      conversationRestoreChallengeIfAbsent.mock.calls[0]?.[0],
    ).toMatchObject({
      challenge: { data: { challengeId: "challenge-1", stepId: "step-1" } },
    })
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("an auto skip that lost the claim records no failure", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
    conversationConsumeChallenge.mockResolvedValueOnce(false)

    const result = await getUserData(
      withStepChallenge(
        makeProps(
          ReplyFormat.email,
          { autoSkip: true, autoSkipFailAttempts: 1 },
          1,
        ),
        { challengeId: "challenge-1" },
      ),
    )

    expect(result.status).toBe("wait")
    expect(contactInboxUpdateTracking).not.toHaveBeenCalled()
  })
})

describe("getUserData — retry asks the question again", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
  })

  function makeRetryProps(overrides: StepOverride = {}, challengeId?: string) {
    const props = makeProps(
      ReplyFormat.email,
      { retryMessage: "Not a valid email", ...overrides },
      1,
    )
    return challengeId ? withStepChallenge(props, { challengeId }) : props
  }

  function flowJobs() {
    return chatQueueAdd.mock.calls
      .filter(([action]) => action === "sendFlowMessage")
      .map(
        ([, job]) =>
          (
            job as {
              data: Record<string, unknown> & { step: { text: string } }
            }
          ).data,
      )
  }

  test("advances the attempt with a compare-and-set on step, challenge and attempt", async () => {
    const result = await getUserData(makeRetryProps({}, "challenge-1"))

    expect(result.status).toBe("retry")
    expect(conversationAdvanceStepChallengeAttempt).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "challenge-1",
      fromAttempts: 1,
      toAttempts: 2,
      lastAttemptAt: expect.any(Date),
    })
    expect(conversationUpdateChallenge).not.toHaveBeenCalled()
  })

  test("the loser of two concurrent invalid replies sends nothing", async () => {
    conversationAdvanceStepChallengeAttempt.mockResolvedValueOnce(false)

    const result = await getUserData(makeRetryProps({}, "challenge-1"))

    expect(result.status).toBe("wait")
    expect(chatQueueAdd).not.toHaveBeenCalled()
  })

  test("sends the retry message without a Skip button, then the question with one", async () => {
    await getUserData(makeRetryProps({}, "challenge-1"))

    const [retry, question] = flowJobs()
    expect(retry?.step.text).toBe("Not a valid email")
    expect(retry).not.toHaveProperty("presetQuickReplies")
    expect(question?.step.text).toBe("Please enter your email")
    expect(question?.presetQuickReplies).toEqual([
      expect.objectContaining({
        label: "Skip",
        postback: "STEP_INPUT_SKIP|challenge-1",
      }),
    ])
  })

  test("a legacy challenge (no id) is upgraded in place and its Skip button carries the new id", async () => {
    const result = await getUserData(makeRetryProps())

    expect(result.status).toBe("retry")
    expect(conversationAdvanceStepChallengeAttempt).not.toHaveBeenCalled()
    expect(challengeSetCalls()[0]?.[0].challenge?.data).toMatchObject({
      attempts: 2,
      challengeId: "test-id",
    })
    expect(flowJobs()[1]?.presetQuickReplies).toEqual([
      expect.objectContaining({ postback: "STEP_INPUT_SKIP|test-id" }),
    ])
  })

  test("an invalid reply that lost to a timeout or Skip tap does not bring the challenge back", async () => {
    const props = makeRetryProps({}, "challenge-1")
    // The job's snapshot still has the challenge; the fresh conversation does not.
    props.conversation = { ...props.conversation, additionalAttributes: {} }

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(conversationUpdateChallenge).not.toHaveBeenCalled()
    expect(conversationAdvanceStepChallengeAttempt).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalled()
  })

  test("nor does it overwrite another step's challenge that took over", async () => {
    const props = withStepChallenge(makeRetryProps(), {
      stepId: "other-step",
    })

    const result = await getUserData(props)

    expect(result.status).toBe("wait")
    expect(conversationUpdateChallenge).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalled()
  })

  test("a failed send after the attempt advanced fails the step and clears the challenge", async () => {
    chatQueueAdd.mockRejectedValueOnce(new Error("queue down"))

    const result = await getUserData(makeRetryProps({}, "challenge-1"))

    expect(result.status).toBe("error")
    expect(challengeClearCalls()).toHaveLength(1)
  })

  test("a failed question send after the retry message fails the step", async () => {
    chatQueueAdd
      .mockResolvedValueOnce({ id: "job-1" })
      .mockRejectedValueOnce(new Error("queue down"))

    const result = await getUserData(makeRetryProps({}, "challenge-1"))

    expect(result.status).toBe("error")
    expect(challengeClearCalls()).toHaveLength(1)
  })
})

describe("getUserData — Skip button", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  function presetOf() {
    const call = chatQueueAdd.mock.calls.find(
      ([action]) => action === "sendFlowMessage",
    )
    return (call?.[1] as { data: { presetQuickReplies?: { label: string }[] } })
      .data.presetQuickReplies
  }

  test("its postback decodes back to the challenge id", async () => {
    vi.mocked(createId).mockReturnValueOnce("11612473309626368")

    await getUserData(makeFreshFirstSendProps())

    const postback = (
      chatQueueAdd.mock.calls[0]?.[1] as {
        data: { presetQuickReplies: { postback: string }[] }
      }
    ).data.presetQuickReplies[0]?.postback
    expect(decodeStepInputSkipPostback(postback)).toBe("11612473309626368")
  })

  test("a blank label sends no button", async () => {
    await getUserData(makeFreshFirstSendProps({ skipButtonLabel: "   " }))

    expect(presetOf()).toBeUndefined()
  })

  test("the shown label is shortened to 20 characters, the stored one is not", async () => {
    const label = "Skip this question and continue"

    await getUserData(makeFreshFirstSendProps({ skipButtonLabel: label }))

    const shown = presetOf()?.[0]?.label ?? ""
    expect(Array.from(shown)).toHaveLength(20)
    expect(shown.endsWith("…")).toBe(true)
  })

  test("never splits an emoji when shortening", async () => {
    await getUserData(
      makeFreshFirstSendProps({ skipButtonLabel: "👍".repeat(30) }),
    )

    const shown = presetOf()?.[0]?.label ?? ""
    expect(Array.from(shown)).toHaveLength(20)
    expect(
      Array.from(shown)
        .slice(0, 19)
        .every((c) => c === "👍"),
    ).toBe(true)
  })

  test("rides with the contact-hint quick reply", async () => {
    contactFindById.mockResolvedValueOnce({
      phoneNumber: "0708122593",
      email: null,
    })
    const props = makeFreshFirstSendProps({ showHint: true })
    props.step = { ...props.step, replyFormat: ReplyFormat.phone }

    await getUserData(props)

    const job = findChatJobCall("sendChatMessage")
    expect(job.data.quickReplies?.map((reply) => reply.label)).toEqual([
      "0708122593",
      "Skip",
    ])
  })
})

describe("getUserData — a run only acts on the challenge cycle it was queued for", () => {
  function withRunChallengeId(
    props: ExecuteStepProps<GetUserDataStepSchema>,
    challengeId: string,
  ) {
    props.ctx = {
      variables: {
        conversation: {
          ...props.ctx?.variables.conversation,
          challengeId: { value: challengeId },
        },
      },
    } as ExecuteStepProps<GetUserDataStepSchema>["ctx"]
    return props
  }

  // The job snapshot says "old-cycle"; the fresh conversation already holds a
  // newer cycle of the SAME step ("new-cycle").
  function staleRun(overrides: StepOverride = {}) {
    return withRunChallengeId(
      withStepChallenge(makeProps(ReplyFormat.email, overrides, 1), {
        challengeId: "new-cycle",
      }),
      "old-cycle",
    )
  }

  beforeEach(() => {
    chatQueueAdd.mockClear()
  })

  test("an older invalid reply does not advance the newer cycle", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })

    const result = await getUserData(staleRun())

    expect(result.status).toBe("wait")
    expect(conversationAdvanceStepChallengeAttempt).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalled()
  })

  test("an older valid reply does not consume the newer cycle or save its answer", async () => {
    lastMessage.current = makeIncomingMessage({ text: "user@example.com" })

    const result = await getUserData(staleRun())

    expect(result.status).toBe("wait")
    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
    expect(contactCustomFieldSetValueByKey).not.toHaveBeenCalled()
  })

  test("an older auto skip does not consume the newer cycle either", async () => {
    lastMessage.current = makeIncomingMessage({ text: "invalid" })

    const result = await getUserData(
      staleRun({ autoSkip: true, autoSkipFailAttempts: 1 }),
    )

    expect(result.status).toBe("wait")
    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
    expect(contactInboxUpdateTracking).not.toHaveBeenCalled()
  })

  test("a run for the cycle that is pending proceeds normally", async () => {
    lastMessage.current = makeIncomingMessage({ text: "user@example.com" })
    const props = withRunChallengeId(
      withStepChallenge(makeProps(ReplyFormat.email), {
        challengeId: "same-cycle",
      }),
      "same-cycle",
    )

    const result = await getUserData(props)

    expect(result.status).toBe("success")
    expect(conversationConsumeChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: "same-cycle" }),
    )
  })
})

describe("getUserData — the reply judged is the message that triggered the run", () => {
  const triggerProps = () => {
    const props = makeProps(ReplyFormat.email)
    props.triggerMessageId = "msg-answer"
    props.triggerMessageCreatedAt = new Date("2026-11-09T10:00:00.000Z")
    return props
  }

  test("an answer queued before a Skip tap is saved, not the Skip label that is now the latest message", async () => {
    triggerMessage.current = makeIncomingMessage({ text: "user@example.com" })
    lastMessage.current = makeIncomingMessage({ text: "Skip" })

    const result = await getUserData(triggerProps())

    expect(result).toEqual({ result: "user@example.com", status: "success" })
    expectCustomFieldWrite("user@example.com")
    expect(findTriggerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "msg-answer",
        conversationId: "conv-1",
        workspaceId: "ws-1",
        requireCompleteResults: true,
      }),
    )
  })

  test("accepts the trigger time as an ISO string (queue payloads are JSON)", async () => {
    triggerMessage.current = makeIncomingMessage({ text: "user@example.com" })
    const props = triggerProps()
    props.triggerMessageCreatedAt =
      "2026-11-09T10:00:00.000Z" as unknown as Date

    const result = await getUserData(props)

    expect(result.status).toBe("success")
  })

  test("falls back to the latest incoming message when the trigger cannot be found", async () => {
    triggerMessage.current = null
    lastMessage.current = makeIncomingMessage({ text: "user@example.com" })

    const result = await getUserData(triggerProps())

    expect(result.status).toBe("success")
    expectCustomFieldWrite("user@example.com")
  })

  test("a run without a trigger keeps judging the latest incoming message", async () => {
    lastMessage.current = makeIncomingMessage({ text: "user@example.com" })

    await getUserData(makeProps(ReplyFormat.email))

    expect(findTriggerMessage).not.toHaveBeenCalled()
  })

  test("a storage failure while reading the trigger still retries the job with the challenge intact", async () => {
    findTriggerMessage.mockImplementationOnce(() => {
      throw new MessageShardUnavailableError("shard down")
    })

    await expect(getUserData(triggerProps())).rejects.toBeInstanceOf(
      MessageShardUnavailableError,
    )
    expect(challengeClearCalls()).toHaveLength(0)
  })
})

describe("getUserData — failure cleanup only clears the cycle the run owns", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
    lastMessage.current = makeIncomingMessage({ text: "invalid" })
  })

  // A retry whose send fails after the attempt advanced, for a run bound to cycle "c1".
  function failingRetry() {
    chatQueueAdd.mockRejectedValueOnce(new Error("queue down"))
    const props = withStepChallenge(makeProps(ReplyFormat.email, {}, 1), {
      challengeId: "c1",
    })
    props.ctx = {
      variables: {
        conversation: {
          ...props.ctx?.variables.conversation,
          challengeId: { value: "c1" },
        },
      },
    } as ExecuteStepProps<GetUserDataStepSchema>["ctx"]
    return props
  }

  test("clears its own cycle through the atomic claim and reports the error", async () => {
    const result = await getUserData(failingRetry())

    expect(result.status).toBe("error")
    expect(conversationConsumeChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "c1",
    })
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("when a timeout, Skip or reply already settled the cycle, it neither erases a newer challenge nor continues the flow again", async () => {
    conversationConsumeChallenge.mockResolvedValueOnce(false)

    const result = await getUserData(failingRetry())

    expect(result.status).toBe("wait")
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("when the cleanup itself fails the job is retried instead of reporting an error the flow would continue past", async () => {
    conversationConsumeChallenge.mockRejectedValueOnce(new Error("db down"))

    await expect(getUserData(failingRetry())).rejects.toThrow("db down")

    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("a run that failed before writing its challenge keeps the unconditional clear", async () => {
    conversationUpdateChallenge.mockRejectedValueOnce(new Error("db down"))

    const result = await getUserData(makeFreshFirstSendProps())

    expect(result.status).toBe("error")
    expect(challengeClearCalls()).toHaveLength(1)
    expect(conversationConsumeChallenge).not.toHaveBeenCalled()
  })

  test("a first prompt whose cleanup fails retries the job instead of clearing unconditionally", async () => {
    chatQueueAdd.mockRejectedValueOnce(new Error("queue down"))
    conversationConsumeChallenge.mockRejectedValueOnce(new Error("db down"))

    await expect(getUserData(makeFreshFirstSendProps())).rejects.toThrow(
      "db down",
    )
    expect(challengeClearCalls()).toHaveLength(0)
  })

  test("a first prompt that fails after its timer already settled the cycle does not erase the newer challenge", async () => {
    // The timer fired while the prompt was sending: the flow moved on and the
    // conversation now holds another challenge, so this cycle is no longer pending.
    chatQueueAdd.mockRejectedValueOnce(new Error("queue down"))
    conversationConsumeChallenge.mockResolvedValueOnce(false)

    const result = await getUserData(makeFreshFirstSendProps())

    expect(result.status).toBe("wait")
    expect(challengeClearCalls()).toHaveLength(0)
  })
})
