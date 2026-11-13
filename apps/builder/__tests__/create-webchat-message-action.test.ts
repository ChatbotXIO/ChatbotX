// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  insertBuilder,
  mockAutomatedResponseEnqueue,
  mockAutomatedResponseEnqueueFlowAction,
  mockAutomatedResponseEnqueueHandoffReentry,
  mockQueueWorkspaceRealtimeEvent,
  mockChatQueueAdd,
  mockCheckGuestRateLimit,
  mockContactFindById,
  mockContactInboxFindLatest,
  mockContactInboxUpdateTracking,
  mockContactUnblockIfBlocked,
  mockConversationEnsureActive,
  mockConversationFindBy,
  mockCreateMessageRepository,
  mockCreateNewContactWithMac,
  mockDbUpdate,
  mockEmit,
  mockEmitContactCreated,
  mockFindOrCreateGuestConversation,
  mockFindOrFail,
  mockFindWebchatByIdForWorkspace,
  mockIntegrationQueueAdd,
  mockQuotaIncrement,
  mockRecordInboundActivity,
  mockRepositoryCreate,
  mockVerifyWebchatAccessToken,
  mockWorkspaceFind,
  tx,
  updateBuilder,
} = vi.hoisted(() => {
  const updateBuilder = {
    set: vi.fn(),
    where: vi.fn(),
  }
  updateBuilder.set.mockReturnValue(updateBuilder)
  updateBuilder.where.mockResolvedValue(undefined)

  const insertBuilder = {
    values: vi.fn(),
    returning: vi.fn(),
  }
  insertBuilder.values.mockReturnValue(insertBuilder)

  const tx = {
    insert: vi.fn().mockReturnValue(insertBuilder),
  }

  const mockRepositoryCreate = vi.fn()

  return {
    insertBuilder,
    mockAutomatedResponseEnqueue: vi.fn().mockResolvedValue(undefined),
    mockAutomatedResponseEnqueueFlowAction: vi
      .fn()
      .mockResolvedValue(undefined),
    mockAutomatedResponseEnqueueHandoffReentry: vi
      .fn()
      .mockResolvedValue(undefined),
    mockQueueWorkspaceRealtimeEvent: vi.fn().mockResolvedValue(undefined),
    mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockCheckGuestRateLimit: vi
      .fn()
      .mockResolvedValue({ limited: false, retryAfter: 10 }),
    mockContactFindById: vi.fn(),
    mockContactInboxFindLatest: vi.fn(),
    mockContactInboxUpdateTracking: vi.fn().mockResolvedValue(null),
    mockContactUnblockIfBlocked: vi.fn().mockResolvedValue(null),
    mockConversationEnsureActive: vi.fn().mockResolvedValue(false),
    mockConversationFindBy: vi.fn(),
    mockCreateMessageRepository: vi.fn().mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: vi.fn(),
    }),
    mockCreateNewContactWithMac: vi.fn(
      async (args: {
        create: (tx: unknown) => Promise<{ value: unknown }>
      }): Promise<
        { ok: true; value: unknown } | { ok: false; level: string }
      > => {
        const created = await args.create(tx)
        return { ok: true, value: created.value }
      },
    ),
    mockDbUpdate: vi.fn().mockReturnValue(updateBuilder),
    mockEmit: vi.fn(),
    mockEmitContactCreated: vi.fn().mockResolvedValue(undefined),
    mockFindOrCreateGuestConversation: vi.fn(),
    mockFindOrFail: vi.fn(),
    mockFindWebchatByIdForWorkspace: vi.fn(),
    mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockQuotaIncrement: vi.fn().mockResolvedValue(undefined),
    mockRecordInboundActivity: vi.fn().mockResolvedValue(null),
    mockRepositoryCreate,
    mockVerifyWebchatAccessToken: vi.fn().mockResolvedValue({
      authorized: true,
      guestConversationId: "workspace-1:guest-1",
    }),
    mockWorkspaceFind: vi.fn().mockResolvedValue({ ownerId: "owner-1" }),
    tx,
    updateBuilder,
  }
})

vi.mock("@/lib/safe-action", () => ({
  actionClient: {
    inputSchema: vi.fn(() => ({
      action: vi.fn(),
    })),
  },
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: {
    enqueue: mockAutomatedResponseEnqueue,
    enqueueFlowAction: mockAutomatedResponseEnqueueFlowAction,
    enqueueHandoffReentry: mockAutomatedResponseEnqueueHandoffReentry,
  },
  isKeywordMediaFileType: (fileType: string) =>
    ["image", "gif", "video", "audio"].includes(fileType),
}))

vi.mock("@chatbotx.io/business", () => ({
  queueWorkspaceRealtimeEvent: mockQueueWorkspaceRealtimeEvent,
  queueMessageCreatedEvent: (
    workspaceId: string,
    data: unknown,
    conversation: {
      assignedInboxTeamId?: string | null
      assignedUserId?: string | null
      inboxId?: string | null
    },
  ) =>
    mockQueueWorkspaceRealtimeEvent(workspaceId, {
      eventType: "messageCreated",
      data,
      route: {
        assignedTeamIds: conversation.assignedInboxTeamId
          ? [conversation.assignedInboxTeamId]
          : [],
        assignedUserIds: conversation.assignedUserId
          ? [conversation.assignedUserId]
          : [],
        ...(conversation.inboxId ? { inboxId: conversation.inboxId } : {}),
      },
    }),
  isWorkspaceScheduledForDeletion: (
    workspace:
      | { scheduledDeletionAt?: Date | string | null }
      | null
      | undefined,
  ) => Boolean(workspace?.scheduledDeletionAt),
  contactInboxService: {
    findLatestBySource: mockContactInboxFindLatest,
    updateTracking: mockContactInboxUpdateTracking,
  },
  contactService: {
    findById: mockContactFindById,
    unblockIfBlocked: mockContactUnblockIfBlocked,
  },
  conversationService: {
    ensureActive: mockConversationEnsureActive,
    findBy: mockConversationFindBy,
    recordInboundActivity: mockRecordInboundActivity,
  },
  integrationWebchatService: {
    findByIdForWorkspace: mockFindWebchatByIdForWorkspace,
    findOrCreateGuestConversation: mockFindOrCreateGuestConversation,
  },
  messageCleanupService: {
    cancelByInboxSource: vi.fn().mockResolvedValue(undefined),
  },
  messageService: {
    create: mockRepositoryCreate,
  },
  quotaEnforcementService: {
    increment: mockQuotaIncrement,
    createNewContactWithMac: mockCreateNewContactWithMac,
  },
  resolveTenantSettings: vi
    .fn()
    .mockResolvedValue({ storageUrl: "https://storage.example.com" }),
  workspaceService: { find: mockWorkspaceFind },
}))
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit: mockCheckGuestRateLimit,
  getGuestClientIp: vi.fn(() => "192.0.2.1"),
}))

vi.mock("@/features/integration-webchat/lib/webchat-access-token", () => ({
  verifyWebchatAccessToken: mockVerifyWebchatAccessToken,
}))

const { mockHeaders } = vi.hoisted(() => ({
  mockHeaders: vi.fn(() => Promise.resolve(new Headers())),
}))

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}))

vi.mock("@/features/integration-webchat/lib/authorized-domain", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/integration-webchat/lib/authorized-domain")
  >("@/features/integration-webchat/lib/authorized-domain")
  return { isAllowedGuestOrigin: actual.isAllowedGuestOrigin }
})

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn((namespace?: string) => {
    const messages: Record<string, string> = {
      "webchat.rateLimitExceeded":
        "Too many requests. Please try again in a moment.",
      "webchat.unauthorizedDomain.description":
        "This website is not authorized to load this chat widget.",
    }

    return Promise.resolve(
      (key: string) => messages[namespace ? `${namespace}.${key}` : key] ?? key,
    )
  }),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: vi.fn((path: string, base: string) => `${base}/${path}`),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  findOrFail: mockFindOrFail,
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {
    id: "contactInboxId",
    firstInteractionAt: "firstInteractionAt",
  },
  contactModel: { id: "contactId" },
  conversationModel: { id: "conversationId" },
  integrationWebchatModel: { id: "integrationWebchatId" },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: mockEmitContactCreated,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadMultipleFiles: vi.fn(),
}))

vi.mock("@chatbotx.io/flow-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/flow-config")>()
  return {
    ...actual,
    messageEventTypeSchema: {
      enum: { "message:received": "message:received" },
    },
  }
})

vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
  routeForConversation: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "generated-id") }
})

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  // The real job builder: the tests assert what producers actually enqueue.
  buildResolveStepInputJob: (
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  ).buildResolveStepInputJob,
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: {
    runChallenge: "runChallenge",
    runFlowPostback: "runFlowPostback",
    resolveStepInput: "resolveStepInput",
    runRef: "runRef",
    sendFlow: "sendFlow",
  },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

const { handleCreateWebchatMessage } = await import(
  "../src/features/messages/actions/create-webchat-message.action"
)

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
  additionalAttributes: null,
}
const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
  sourceId: "guest-1",
  source: "webchat",
  channel: "webchat",
}
const contact = {
  id: "contact-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

const resetCommonMocks = () => {
  vi.clearAllMocks()
  updateBuilder.set.mockReturnValue(updateBuilder)
  updateBuilder.where.mockResolvedValue(undefined)
  mockDbUpdate.mockReturnValue(updateBuilder)
  mockFindOrFail.mockResolvedValue({
    inboxId: "inbox-1",
    authorizedDomains: [],
    persistentMenus: [],
  })
  mockConversationFindBy.mockResolvedValue(conversation)
  mockContactFindById.mockResolvedValue(contact)
  mockContactUnblockIfBlocked.mockResolvedValue(null)
  mockRepositoryCreate.mockImplementation((input) =>
    Promise.resolve({
      id: "msg-1",
      ...input,
      sourceId: null,
      updatedAt: input.createdAt,
    }),
  )
  mockCreateMessageRepository.mockResolvedValue({
    create: mockRepositoryCreate,
    createWithAttachments: vi.fn(),
  })
  mockChatQueueAdd.mockResolvedValue(undefined)
  mockQueueWorkspaceRealtimeEvent.mockResolvedValue(undefined)
  tx.insert.mockReturnValue(insertBuilder)
  insertBuilder.values.mockReturnValue(insertBuilder)
  insertBuilder.returning.mockReset()
  mockQuotaIncrement.mockResolvedValue(undefined)
  mockCheckGuestRateLimit.mockResolvedValue({ limited: false, retryAfter: 10 })
  mockVerifyWebchatAccessToken.mockResolvedValue({
    authorized: true,
  })
  mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
  mockFindOrFail.mockResolvedValue({
    inboxId: "inbox-1",
    authorizedDomains: [],
    persistentMenus: [],
  })
  mockFindWebchatByIdForWorkspace.mockImplementation(() => mockFindOrFail())
  mockFindOrCreateGuestConversation.mockResolvedValue({
    conversation,
    contact,
    contactInbox,
  })
  mockCreateNewContactWithMac.mockImplementation(
    async (args: { create: (tx: unknown) => Promise<{ value: unknown }> }) => {
      const created = await args.create(tx)
      return { ok: true, value: created.value }
    },
  )
}

describe("handleCreateWebchatMessage", () => {
  beforeEach(() => {
    resetCommonMocks()
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)
  })

  test("records inbound activity through the conversation service, workspace-scoped, without a direct db write", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    const messageInput = mockRepositoryCreate.mock.calls[0]?.[0] as {
      createdAt: Date
    }
    expect(mockRecordInboundActivity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      at: messageInput.createdAt,
      contactRepliedAt: messageInput.createdAt,
      contactLastReadAt: expect.any(Date),
      tracking: expect.objectContaining({
        firstInteractionAt: messageInput.createdAt,
        lastIncomingMessageAt: messageInput.createdAt,
        lastMessageAt: messageInput.createdAt,
      }),
    })
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("waits for the created-message event before resolving", async () => {
    let resolveRealtimeDelivery: () => void = () => undefined
    mockQueueWorkspaceRealtimeEvent.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRealtimeDelivery = resolve
        }),
    )

    const action = handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
        clientId: "client-1",
      },
    })

    await vi.waitFor(() => {
      expect(mockQueueWorkspaceRealtimeEvent).toHaveBeenCalled()
    })

    let resolved = false
    const completion = action.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)

    resolveRealtimeDelivery()
    await completion

    expect(mockQueueWorkspaceRealtimeEvent).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "messageCreated",
        data: expect.objectContaining({
          id: "msg-1",
          clientId: "client-1",
        }),
      }),
    )
  })

  test("rejects messages when the workspace is scheduled for deletion", async () => {
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      scheduledDeletionAt: new Date(),
    })

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          text: "hello",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "workspaceScheduledDeletion",
    })

    expect(mockVerifyWebchatAccessToken).not.toHaveBeenCalled()
  })

  test("auto-unblocks using the resolved contact row after creating an inbound message", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockContactUnblockIfBlocked).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "contact-1" },
      contact,
    )
  })

  test("enqueues automated response with workspace context for active text messages", async () => {
    mockConversationEnsureActive.mockResolvedValue(true)

    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockAutomatedResponseEnqueue).toHaveBeenCalledWith({
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      messageId: "msg-1",
      messageText: "hello",
      attachmentFileTypes: [],
      workspaceId: "ws-1",
    })
    expect(mockAutomatedResponseEnqueueHandoffReentry).not.toHaveBeenCalled()
  })

  test("enqueues handoff re-entry instead of automated response for inactive text messages", async () => {
    mockConversationEnsureActive.mockResolvedValue(false)

    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockAutomatedResponseEnqueueHandoffReentry).toHaveBeenCalledWith({
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      messageId: "msg-1",
      workspaceId: "ws-1",
    })
    expect(mockAutomatedResponseEnqueue).not.toHaveBeenCalled()
  })

  test("enqueues webchat postbacks through flow action debounce", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "clicked",
        postback: "button-a",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockAutomatedResponseEnqueueFlowAction).toHaveBeenCalledWith({
      kind: "postback",
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        action: "button-a",
      },
    })
    expect(mockAutomatedResponseEnqueue).not.toHaveBeenCalled()
  })

  describe("step input Skip tap", () => {
    const CHALLENGE_ID = "11612473309626368"
    const skipPostback = `STEP_INPUT_SKIP|${CHALLENGE_ID}`
    const pendingStepChallenge = {
      type: "step",
      data: {
        flowId: "flow-1",
        nodeId: "node-1",
        stepId: "step-1",
        attempts: 1,
        lastAttemptAt: new Date(),
        challengeId: CHALLENGE_ID,
      },
    }

    function tap(overrides: Record<string, unknown> = {}) {
      return handleCreateWebchatMessage({
        parsedInput: {
          text: "Skip",
          postback: skipPostback,
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
          ...overrides,
        },
      })
    }

    beforeEach(() => {
      mockConversationFindBy.mockResolvedValue({
        ...conversation,
        additionalAttributes: { challenge: pendingStepChallenge },
      })
    })

    test("is resolved by its own job after the tap's message is saved, never as a flow action", async () => {
      await tap()

      expect(mockAutomatedResponseEnqueueFlowAction).not.toHaveBeenCalled()
      expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
        "resolveStepInput",
        {
          type: "resolveStepInput",
          data: {
            conversationId: "conv-1",
            contactInboxId: "ci-1",
            challengeId: CHALLENGE_ID,
            reason: "user_skipped",
            messageId: "msg-1",
            messageCreatedAt: expect.any(Date),
          },
        },
        // Active-only dedup, never a fixed jobId: a retained completed job
        // would silently drop a later tap.
        { deduplication: { id: `step-input-conv-1-${CHALLENGE_ID}` } },
      )
      expect(mockRepositoryCreate.mock.invocationCallOrder[0]).toBeLessThan(
        mockIntegrationQueueAdd.mock.invocationCallOrder[0] ?? 0,
      )
    })

    test("a failed enqueue surfaces instead of being swallowed with the best-effort jobs", async () => {
      mockIntegrationQueueAdd.mockImplementation((action: string) =>
        action === "resolveStepInput"
          ? Promise.reject(new Error("redis down"))
          : Promise.resolve(undefined),
      )

      await expect(tap()).rejects.toThrow("redis down")

      mockIntegrationQueueAdd.mockReset()
      mockIntegrationQueueAdd.mockResolvedValue(undefined)
    })

    test("is never also run as a typed reply to the pending challenge", async () => {
      await tap()

      expect(mockIntegrationQueueAdd).not.toHaveBeenCalledWith(
        "runChallenge",
        expect.anything(),
        expect.anything(),
      )
      expect(mockAutomatedResponseEnqueue).not.toHaveBeenCalled()
    })

    test.each([
      ["a non-numeric id", "STEP_INPUT_SKIP|abc"],
      ["an oversized id", "STEP_INPUT_SKIP|99999999999999999999"],
    ])("treats %s as an ordinary postback", async (_label, postback) => {
      await tap({ postback })

      expect(mockAutomatedResponseEnqueueFlowAction).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "postback" }),
      )
      expect(mockIntegrationQueueAdd).not.toHaveBeenCalledWith(
        "resolveStepInput",
        expect.anything(),
        expect.anything(),
      )
    })

    test("an ordinary button tap on a pending step challenge keeps its existing behavior", async () => {
      await tap({ postback: "button-a", text: "clicked" })

      expect(mockAutomatedResponseEnqueueFlowAction).toHaveBeenCalled()
      expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
        "runChallenge",
        expect.anything(),
        expect.anything(),
      )
    })

    test("each typed reply gets its own run, so a quick second answer is never dropped", async () => {
      let created = 0
      mockRepositoryCreate.mockImplementation((input) => {
        created += 1
        return Promise.resolve({
          id: `msg-${created}`,
          ...input,
          sourceId: null,
          updatedAt: input.createdAt,
        })
      })

      await tap({ postback: undefined, text: "abc" })
      await tap({ postback: undefined, text: "me@x.com" })

      const runs = mockIntegrationQueueAdd.mock.calls.filter(
        ([action]) => action === "runChallenge",
      ) as [string, { data: { messageId: string } }, { jobId?: string }][]
      expect(runs.map(([, job]) => job.data.messageId)).toEqual([
        "msg-1",
        "msg-2",
      ])
      expect(runs.map(([, , options]) => options.jobId)).toEqual([
        "webchat-challenge-conv-1-msg-1",
        "webchat-challenge-conv-1-msg-2",
      ])
      // A deduplicated (dropped) run would never process its message.
      expect(runs[0]?.[2]).not.toHaveProperty("deduplication")
    })

    test("a typed reply names the message it answers, so it is judged on its own text", async () => {
      await tap({ postback: undefined, text: "user@example.com" })

      const [, job] = mockIntegrationQueueAdd.mock.calls.find(
        ([action]) => action === "runChallenge",
      ) as [string, { data: Record<string, unknown> }]
      expect(job.data).toMatchObject({
        messageId: "msg-1",
        messageCreatedAt: expect.any(Date),
      })
    })
  })

  test("rejects unauthorized webchat origins before resolving conversations", async () => {
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: ["example.com"],
    })

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          text: "hello",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
          parentOrigin: "https://attacker.test",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      httpStatusCode: 403,
    })

    expect(mockContactInboxFindLatest).not.toHaveBeenCalled()
  })

  test("allows the app's own host even when it is not in authorizedDomains (bot simulator)", async () => {
    // The bot simulator's widget runs on the app host, not on the simulated
    // website, so its parentOrigin is always the app host.
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: ["example.com"],
    })
    mockHeaders.mockResolvedValue(
      new Headers({ "x-domain": "app.chatbotx.test" }),
    )

    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
        parentOrigin: "https://app.chatbotx.test",
      },
    }).catch(() => undefined)

    expect(mockContactInboxFindLatest).toHaveBeenCalled()
  })

  test("still rejects a third-party origin when the app host is known", async () => {
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: ["example.com"],
    })
    mockHeaders.mockResolvedValue(
      new Headers({ "x-domain": "app.chatbotx.test" }),
    )

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          text: "hello",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
          parentOrigin: "https://attacker.test",
        },
      }),
    ).rejects.toMatchObject({ code: "forbidden", httpStatusCode: 403 })
  })

  test("rejects an invalid access token even when no authorizedDomains are configured", async () => {
    // Bind-on-first-use: the token must always verify, regardless of
    // whether the webchat has an authorizedDomains allowlist configured.
    mockVerifyWebchatAccessToken.mockResolvedValue({
      authorized: false,
    })

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          text: "hello",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      httpStatusCode: 403,
    })

    expect(mockContactInboxFindLatest).not.toHaveBeenCalled()
  })
})

describe("handleCreateWebchatMessage — flowId", () => {
  beforeEach(() => {
    resetCommonMocks()
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)
  })

  test("rejects a flowId that is not configured as a persistent menu flow (flow injection / IDOR)", async () => {
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: [],
      persistentMenus: [
        { label: "Talk to sales", type: "flow", flowId: "flow-allowed" },
      ],
    })

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          flowId: "flow-attacker",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "notFound",
      httpStatusCode: 404,
    })

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueues a flowId that matches a configured persistent menu flow", async () => {
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: [],
      persistentMenus: [
        { label: "Talk to sales", type: "flow", flowId: "flow-allowed" },
      ],
    })

    await handleCreateWebchatMessage({
      parsedInput: {
        flowId: "flow-allowed",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        type: "sendFlow",
        data: expect.objectContaining({
          conversationId: expect.objectContaining({ id: "conv-1" }),
          contactInboxId: expect.objectContaining({ id: "ci-1" }),
          flowId: "flow-allowed",
          origin: "channel",
        }),
      }),
    )
  })
})

describe("handleCreateWebchatMessage — MAC quota", () => {
  beforeEach(() => {
    resetCommonMocks()
  })

  const input = {
    text: "hello",
    workspaceId: "ws-1",
    webchatId: "webchat-1",
    guestConversationId: "guest-1",
  }

  test("does not touch quota for an existing contact", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)

    await handleCreateWebchatMessage({ parsedInput: input })

    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("does not requeue the welcome flow for a returning visitor", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: [],
      welcomeFlowId: "flow-1",
    })

    await handleCreateWebchatMessage({ parsedInput: input })

    expect(mockEmitContactCreated).not.toHaveBeenCalled()
    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })

  test("gates a new contact through the atomic MAC chokepoint", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)
    mockFindWebchatByIdForWorkspace.mockResolvedValue({
      id: "webchat-1",
      inboxId: "inbox-1",
      authorizedDomains: [],
      persistentMenus: [],
    })
    mockFindOrCreateGuestConversation.mockResolvedValue({
      contact: { ...contact, id: "contact-new" },
      contactInbox: { ...contactInbox, id: "ci-new", sourceId: "guest-1" },
      conversation: { ...conversation, id: "conv-new" },
    })

    await handleCreateWebchatMessage({ parsedInput: input })

    // MAC is the owner-derived billing gate and a soft cap on resetting plans:
    // Redis admission, transactional create, then commit/revoke, all inside
    // integrationWebchatService.findOrCreateGuestConversation (covered by
    // integration-webchat-service.test.ts, including the emitContactCreated
    // call after commit). This action only has to delegate to it and never
    // increment quota separately (that would double-count).
    expect(mockFindOrCreateGuestConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        guestConversationId: "guest-1",
        integration: expect.objectContaining({ id: "webchat-1" }),
        workspace: { ownerId: "owner-1" },
        workspaceId: "ws-1",
      }),
    )
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("queues the configured welcome flow for a new contact", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)
    mockFindWebchatByIdForWorkspace.mockResolvedValue({
      id: "webchat-1",
      inboxId: "inbox-1",
      authorizedDomains: [],
      persistentMenus: [],
      welcomeFlowId: "flow-1",
    })
    mockFindOrCreateGuestConversation.mockResolvedValue({
      contact: { ...contact, id: "contact-new" },
      contactInbox: { ...contactInbox, id: "ci-new", sourceId: "guest-1" },
      conversation: { ...conversation, id: "conv-new" },
    })

    await handleCreateWebchatMessage({
      parsedInput: {
        ...input,
        init: true,
      },
    })

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        type: "sendFlow",
        data: expect.objectContaining({
          conversationId: expect.objectContaining({ id: "conv-new" }),
          contactInboxId: expect.objectContaining({ id: "ci-new" }),
          flowId: "flow-1",
          origin: "channel",
        }),
      }),
    )
  })

  test("does not queue a welcome flow when it is not configured", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)
    mockFindWebchatByIdForWorkspace.mockResolvedValue({
      id: "webchat-1",
      inboxId: "inbox-1",
      authorizedDomains: [],
      persistentMenus: [],
    })
    mockFindOrCreateGuestConversation.mockResolvedValue({
      contact: { ...contact, id: "contact-new" },
      contactInbox: { ...contactInbox, id: "ci-new", sourceId: "guest-1" },
      conversation: { ...conversation, id: "conv-new" },
    })

    await handleCreateWebchatMessage({
      parsedInput: {
        ...input,
        init: true,
      },
    })

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalledWith(
      "sendFlow",
      expect.anything(),
    )
  })

  test("rejects and creates nothing when the MAC limit is reached", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)
    mockFindOrCreateGuestConversation.mockResolvedValue(null)

    await expect(
      handleCreateWebchatMessage({ parsedInput: input }),
    ).rejects.toMatchObject({
      message: "Contact limit reached",
      code: "quotaExceeded",
    })

    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("does not create a contact for existing webchat inbox even with payload locale and timezone", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)

    await handleCreateWebchatMessage({
      parsedInput: {
        ...input,
        locale: "vi-VN",
        timezone: "Asia/Ho_Chi_Minh",
      },
    })

    expect(tx.insert).not.toHaveBeenCalled()
  })
})
