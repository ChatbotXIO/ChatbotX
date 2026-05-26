import type { GetUserDataStepSchema } from "@chatbotx.io/flow-config"
import { ReplyFormat } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

// --- mocks ---

const dbUpdateBuilder: Record<string, unknown> = {}
dbUpdateBuilder.set = vi.fn(() => dbUpdateBuilder)
dbUpdateBuilder.where = vi.fn(() => dbUpdateBuilder)

const dbInsertBuilder: Record<string, unknown> = {}
dbInsertBuilder.values = vi.fn(() => dbInsertBuilder)
dbInsertBuilder.onConflictDoUpdate = vi.fn(async () => undefined)

const dbTransactionFn = vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
  await cb({
    insert: vi.fn(() => dbInsertBuilder),
    update: vi.fn(() => dbUpdateBuilder),
  })
})

const lastMessage: {
  current: {
    text?: string | null
    attachments: { fileType: string; originPath: string }[]
  } | null
} = { current: null }

const findOrFailResult: { current: unknown } = { current: { id: "field-1" } }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      messageModel: {
        findFirst: vi.fn(async () => lastMessage.current),
      },
      contactCustomFieldModel: {
        findFirst: vi.fn(async () => null),
      },
      contactInboxModel: {
        findFirst: vi.fn(async () => null),
      },
    },
    update: vi.fn(() => dbUpdateBuilder),
    insert: vi.fn(() => dbInsertBuilder),
    transaction: dbTransactionFn,
  },
  eq: vi.fn(),
  findOrFail: vi.fn(async () => findOrFailResult.current),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactCustomFieldModel: {},
  conversationModel: {},
  customFieldModel: {},
}))

vi.mock("@chatbotx.io/database/partials", () => ({}))

const chatQueueAdd = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendChatMessage: "sendChatMessage" },
  chatQueue: { add: chatQueueAdd },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "test-id"),
  }
})

vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

// --- helpers ---

const { getUserData } = await import("./get-user-data")

type StepOverride = Partial<GetUserDataStepSchema>

function makeProps(
  replyFormat: ReplyFormat,
  overrides: StepOverride = {},
  attempts = 1,
) {
  return {
    conversation: {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      assignedUserId: null,
      assignedInboxTeamId: null,
      additionalAttributes: {},
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
    targetId: "node-1",
    targetNodeId: "node-1",
    step: {
      id: "step-1",
      stepType: "getUserData" as const,
      message: "Please enter your email",
      replyFormat,
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
          challengeLastAttemptAt: { value: new Date() },
        },
      },
    },
  } as any
}

// --- tests ---

describe("getUserData — validation logic", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
    vi.mocked(dbUpdateBuilder.set as ReturnType<typeof vi.fn>).mockClear?.()
    lastMessage.current = null
  })

  describe("email format", () => {
    test("valid email → returns success", async () => {
      lastMessage.current = { text: "user@example.com", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.email))
      expect(result.status).toBe("success")
    })

    test("invalid email → returns retry", async () => {
      lastMessage.current = { text: "not-an-email", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.email))
      expect(result.status).toBe("retry")
    })
  })

  describe("number format", () => {
    test("valid number → returns success", async () => {
      lastMessage.current = { text: "42", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.number))
      expect(result.status).toBe("success")
    })

    test("decimal number → returns success", async () => {
      lastMessage.current = { text: "3.14", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.number))
      expect(result.status).toBe("success")
    })

    test("non-numeric text → returns retry", async () => {
      lastMessage.current = { text: "hello", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.number))
      expect(result.status).toBe("retry")
    })
  })

  describe("phone format", () => {
    test("valid phone → returns success", async () => {
      lastMessage.current = { text: "+1-555-123-4567", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.phone))
      expect(result.status).toBe("success")
    })

    test("invalid phone → returns retry", async () => {
      lastMessage.current = { text: "not-a-phone", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.phone))
      expect(result.status).toBe("retry")
    })
  })

  describe("link format", () => {
    test("valid URL → returns success", async () => {
      lastMessage.current = { text: "https://example.com", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.link))
      expect(result.status).toBe("success")
    })

    test("invalid URL → returns retry", async () => {
      lastMessage.current = { text: "not-a-url", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.link))
      expect(result.status).toBe("retry")
    })
  })

  describe("default (free text) format", () => {
    test("any text → returns success", async () => {
      lastMessage.current = { text: "anything goes", attachments: [] }
      const result = await getUserData(makeProps(ReplyFormat.text))
      expect(result.status).toBe("success")
    })
  })

  describe("attachment formats", () => {
    test("image attachment with image format → returns success", async () => {
      lastMessage.current = {
        text: null,
        attachments: [{ fileType: "image", originPath: "/img.jpg" }],
      }
      const result = await getUserData(makeProps(ReplyFormat.image))
      expect(result.status).toBe("success")
    })

    test("file attachment with file format → returns success", async () => {
      lastMessage.current = {
        text: null,
        attachments: [{ fileType: "pdf", originPath: "/doc.pdf" }],
      }
      const result = await getUserData(makeProps(ReplyFormat.file))
      expect(result.status).toBe("success")
    })

    test("image attachment but wrong format → returns retry", async () => {
      lastMessage.current = {
        text: null,
        attachments: [{ fileType: "image", originPath: "/img.jpg" }],
      }
      const result = await getUserData(makeProps(ReplyFormat.email))
      expect(result.status).toBe("retry")
    })
  })

  describe("no message", () => {
    test("no last message → returns retry", async () => {
      lastMessage.current = null
      const result = await getUserData(makeProps(ReplyFormat.email))
      expect(result.status).toBe("retry")
    })
  })
})

describe("getUserData — attempt counter (Bug B fix)", () => {
  beforeEach(() => {
    chatQueueAdd.mockClear()
    vi.mocked(dbUpdateBuilder.set as ReturnType<typeof vi.fn>).mockClear()
    lastMessage.current = { text: "invalid-email", attachments: [] }
  })

  function getUpdatedAttempts(): number {
    const setMock = dbUpdateBuilder.set as ReturnType<typeof vi.fn>
    const setArg = vi.mocked(setMock).mock.calls[0]?.[0] as {
      additionalAttributes: { challenge: { data: { attempts: number } } }
    }
    return setArg.additionalAttributes.challenge.data.attempts
  }

  test("increments attempts from 1 to 2 on first retry", async () => {
    await getUserData(makeProps(ReplyFormat.email, {}, 1))
    expect(getUpdatedAttempts()).toBe(2)
  })

  test("increments attempts from 2 to 3 on second retry", async () => {
    await getUserData(makeProps(ReplyFormat.email, {}, 2))
    expect(getUpdatedAttempts()).toBe(3)
  })
})

describe("getUserData — auto-skip", () => {
  test("skips after exceeding max attempts", async () => {
    lastMessage.current = { text: "invalid", attachments: [] }
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
  })
})

describe("getUserData — first send (no challenge state)", () => {
  test("sends message and returns wait when no challenge active", async () => {
    const props = makeProps(ReplyFormat.email)
    props.ctx = { variables: { conversation: {} } }
    const result = await getUserData(props)
    expect(result.status).toBe("wait")
    expect(chatQueueAdd).toHaveBeenCalledOnce()
  })
})
