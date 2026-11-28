import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ChatStoreContext } from "@/features/chat/store/chat-store-provider"
import { useWhatsappVoipCallStore } from "@/features/integration-whatsapp/calling/voip/voip-call-store"

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

const {
  invalidateQueriesMock,
  setQueryDataMock,
  fetchQueryMock,
  fetchInfiniteQueryMock,
  membersState,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
  setQueryDataMock: vi.fn(),
  fetchQueryMock: vi.fn(),
  fetchInfiniteQueryMock: vi.fn(),
  membersState: {
    data: undefined as
      | {
          userId: string
          user: { name: string | null; image: string | null }
        }[]
      | undefined,
  },
}))
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
    fetchQuery: fetchQueryMock,
    fetchInfiniteQuery: fetchInfiniteQueryMock,
  }),
}))

vi.mock("@/features/users/provider/user-hook", () => ({
  useWorkspaceMembers: () => ({ data: membersState.data }),
  workspaceMembersQueryOptions: () => ({ queryKey: ["members"] }),
}))
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const bubbleConversationToTopMock = vi.fn().mockResolvedValue(undefined)
const openConversationMock = vi.fn().mockResolvedValue(true)
const chatStoreState = {
  applyAgentLastReadAt: vi.fn(),
  applyConversationParticipantReply: vi.fn(),
  findLoadedMessage: vi.fn(),
  replaceConversationRecentParticipants: vi.fn(),
  handleNewMessages: vi.fn(),
  markMessagesDeleted: vi.fn(),
  removeMessages: vi.fn(),
  markMessageFailed: vi.fn(),
  settleSendResult: vi.fn(),
  assignMessageCommentId: vi.fn(),
  updateMessageText: vi.fn(),
  applyMessageTranslations: vi.fn(),
  updateMessageContentAttributes: vi.fn(),
  updateContact: vi.fn(),
  updateConversations: vi.fn(),
  bubbleConversationToTop: bubbleConversationToTopMock,
  openConversation: openConversationMock,
  patchContactInboxThreadControl: vi.fn(),
  resumeConversationHeadRefresh: vi.fn(),
  scheduleConversationHeadRefresh: vi.fn(),
}
const wholeStoreSelectionMock = vi.fn()
const clientMock = vi.hoisted(() => ({
  listContactTagPreviewsAuthenticatedAPI: vi.fn(),
}))
// Only the tag-preview call is replaced; every other procedure (the
// participants query options in `@/lib/orpc/query`) keeps the real client.
vi.mock("@/lib/orpc/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc/orpc")>()
  const conversationsAPI = new Proxy(actual.client.conversationsAPI, {
    get: (target, property, receiver) =>
      property === "listContactTagPreviewsAuthenticatedAPI"
        ? clientMock.listContactTagPreviewsAuthenticatedAPI
        : Reflect.get(target, property, receiver),
  })
  return {
    ...actual,
    client: new Proxy(actual.client, {
      get: (target, property, receiver) =>
        property === "conversationsAPI"
          ? conversationsAPI
          : Reflect.get(target, property, receiver),
    }),
  }
})
vi.mock("@/features/chat/store/chat-store-provider", async () => ({
  // The real context: ChatRealtime reads the store API through it for the
  // tag-preview refresher; tests without a provider get `undefined`.
  ChatStoreContext: (await import("react")).createContext(undefined),
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) => {
    const selection = selector(chatStoreState)
    if (selection === chatStoreState) {
      wholeStoreSelectionMock()
    }
    return selection
  },
}))

const responseSlaState = { enabled: false }
vi.mock("@/features/response-sla/provider/response-sla-hook", () => ({
  useResponseSlaEnabled: () => responseSlaState.enabled,
}))

const conversationIdParamMock = { set: vi.fn(), clear: vi.fn() }
vi.mock("@/features/conversations/hooks/use-conversation-id-param", () => ({
  useConversationIdParam: () => conversationIdParamMock,
}))

// Captures the handler map `ChatRealtime` passes to `useWorkspaceRealtimeEvents`
// so `emit` can invoke it directly, mirroring what the real provider dispatches.
let capturedHandlers: Record<string, (event: unknown) => void> | null = null
vi.mock("@/features/realtime/use-workspace-realtime-events", () => ({
  useWorkspaceRealtimeEvents: (
    handlers: Record<string, (event: unknown) => void>,
  ) => {
    capturedHandlers = handlers
  },
}))

const { ChatRealtime } = await import("@/features/chat/chat-realtime")

function emit(eventType: string, data: unknown) {
  capturedHandlers?.[eventType]?.({ eventType, data })
}

const baseVoipCall = {
  transport: "voip" as const,
  whatsappCallId: "call-1",
  wacid: "wacid-1",
  direction: "inbound" as const,
  phase: "incomingRinging" as const,
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  offer: { sdpType: "offer" as const, sdp: "v=0 offer" },
  deadlineAt: new Date(Date.now() + 20_000).toISOString(),
  isMuted: false,
  isRecording: false,
}

describe("ChatRealtime — chat event parity", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    fetchQueryMock.mockResolvedValue({ data: [] })
    fetchInfiniteQueryMock.mockResolvedValue({
      pageParams: [undefined],
      pages: [{ data: [], nextCursor: null }],
    })
    membersState.data = [
      { userId: "user-1", user: { name: "Hoàng", image: "avatar.png" } },
    ]
    bubbleConversationToTopMock.mockResolvedValue(undefined)
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("subscribes only to stable actions instead of the whole chat store", async () => {
    await render()

    expect(wholeStoreSelectionMock).not.toHaveBeenCalled()
  })

  test("registers exactly the fourteen chat events, no more, no fewer", async () => {
    await render()
    expect(Object.keys(capturedHandlers ?? {}).sort()).toEqual(
      [
        "contactBlocked",
        "contactInboxThreadControlUpdated",
        "contactTagsChanged",
        "contactUnblocked",
        "conversationAssigned",
        "conversationUpdated",
        "messageContentUpdated",
        "messageCreated",
        "messageDeleted",
        "messageFailed",
        "messageIdAssigned",
        "messageRemoved",
        "messageTranslationUpdated",
        "messageUpdated",
      ].sort(),
    )
  })

  test("retries a deferred head refresh when the tab becomes visible", async () => {
    await render()

    act(() => document.dispatchEvent(new Event("visibilitychange")))

    expect(chatStoreState.resumeConversationHeadRefresh).toHaveBeenCalledWith(
      "workspace-1",
    )
  })

  test("messageDeleted marks messages deleted", async () => {
    await render()
    act(() => emit("messageDeleted", { messageIds: ["m1"] }))
    expect(chatStoreState.markMessagesDeleted).toHaveBeenCalledWith(["m1"])
  })

  test("messageRemoved drops the messages from the timeline", async () => {
    await render()
    act(() => emit("messageRemoved", { messageIds: ["m1"] }))
    expect(chatStoreState.removeMessages).toHaveBeenCalledWith(["m1"])
  })

  test("messageIdAssigned assigns the comment id", async () => {
    await render()
    act(() => emit("messageIdAssigned", { messageId: "m1", commentId: "c1" }))
    expect(chatStoreState.assignMessageCommentId).toHaveBeenCalledWith(
      "m1",
      "c1",
    )
  })

  test("messageFailed marks the message failed", async () => {
    await render()
    act(() =>
      emit("messageFailed", {
        messageId: "m1",
        clientId: "client-1",
        error: "boom",
      }),
    )
    expect(chatStoreState.markMessageFailed).toHaveBeenCalledWith(
      "m1",
      "client-1",
      "boom",
    )
  })

  test("messageFailed is also the composer queue's answer, success (null) included", async () => {
    await render()
    act(() =>
      emit("messageFailed", { messageId: "m1", clientId: "c1", error: null }),
    )
    act(() =>
      emit("messageFailed", { messageId: "m2", clientId: "c2", error: "boom" }),
    )

    expect(chatStoreState.settleSendResult).toHaveBeenNthCalledWith(1, {
      messageId: "m1",
      clientId: "c1",
      error: null,
    })
    expect(chatStoreState.settleSendResult).toHaveBeenNthCalledWith(2, {
      messageId: "m2",
      clientId: "c2",
      error: "boom",
    })
  })

  test("messageUpdated updates the message text/attachment fields", async () => {
    await render()
    act(() =>
      emit("messageUpdated", {
        messageId: "m1",
        newText: "hello",
        newAttachmentPath: "p",
        newAttachmentPublicUrl: "u",
        newAttachmentMimeType: "image/png",
        newAttachmentWidth: 10,
        newAttachmentHeight: 20,
        removedAttachment: false,
      }),
    )
    expect(chatStoreState.updateMessageText).toHaveBeenCalledWith(
      "m1",
      "hello",
      {
        newAttachmentPath: "p",
        newAttachmentPublicUrl: "u",
        newAttachmentMimeType: "image/png",
        newAttachmentWidth: 10,
        newAttachmentHeight: 20,
        removedAttachment: false,
      },
    )
  })

  test("messageContentUpdated patches content attributes", async () => {
    await render()
    act(() =>
      emit("messageContentUpdated", {
        messageId: "m1",
        contentAttributes: { foo: "bar" },
      }),
    )
    expect(chatStoreState.updateMessageContentAttributes).toHaveBeenCalledWith(
      "m1",
      { foo: "bar" },
    )
  })

  test("messageTranslationUpdated applies the items and the conversation language", async () => {
    await render()
    const items = [
      { messageId: "m1", status: "translated", displayText: "Xin chào" },
    ]
    act(() =>
      emit("messageTranslationUpdated", {
        conversationId: "c1",
        items,
        conversationLanguage: "es",
      }),
    )
    expect(chatStoreState.applyMessageTranslations).toHaveBeenCalledWith(
      "c1",
      items,
      "es",
      undefined,
    )
  })

  test("messageTranslationUpdated ends the translating state, so a failure shows as failed", async () => {
    const { useTranslationUiStore } = await import(
      "@/features/translation/store/translation-ui-store"
    )
    useTranslationUiStore.getState().markRequested(["m1", "m2"])
    await render()

    act(() =>
      emit("messageTranslationUpdated", {
        conversationId: "c1",
        items: [{ messageId: "m1", status: "failed" }],
      }),
    )

    expect(Object.keys(useTranslationUiStore.getState().entries)).toEqual([
      "m2",
    ])
  })

  test("messageTranslationUpdated passes on translation turned off for the conversation", async () => {
    await render()
    act(() =>
      emit("messageTranslationUpdated", {
        conversationId: "c1",
        items: [],
        conversationEnabledOverride: false,
      }),
    )
    expect(chatStoreState.applyMessageTranslations).toHaveBeenCalledWith(
      "c1",
      [],
      undefined,
      false,
    )
  })

  describe("contactTagsChanged", () => {
    const renderWithStore = (
      loadedContactIds: string[],
      activeContactId: string | null = null,
    ) =>
      act(() => {
        root.render(
          <ChatStoreContext.Provider
            value={
              {
                getState: () => ({
                  activeConversationId: activeContactId
                    ? `conv-${activeContactId}`
                    : null,
                  conversations: loadedContactIds.map((contactId) => ({
                    id: `conv-${contactId}`,
                    contactId,
                  })),
                  updateContact: chatStoreState.updateContact,
                }),
              } as never
            }
          >
            <ChatRealtime />
          </ChatStoreContext.Provider>,
        )
      })

    beforeEach(() => {
      vi.useFakeTimers()
      clientMock.listContactTagPreviewsAuthenticatedAPI.mockReset()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    test("refreshes only loaded rows, in one coalesced request, and patches the store", async () => {
      clientMock.listContactTagPreviewsAuthenticatedAPI.mockResolvedValue({
        data: [
          {
            contactId: "c1",
            tagCount: 4,
            tagPreview: [{ id: "t1", name: "alpha", color: "#1A2B3C" }],
          },
        ],
      })
      await renderWithStore(["c1", "c2"])

      act(() => emit("contactTagsChanged", { contactIds: ["c1", "zzz"] }))
      act(() => emit("contactTagsChanged", { contactIds: ["c2"] }))
      await act(() => vi.advanceTimersByTimeAsync(500))

      expect(
        clientMock.listContactTagPreviewsAuthenticatedAPI,
      ).toHaveBeenCalledExactlyOnceWith({
        workspaceId: "workspace-1",
        contactIds: ["c1", "c2"],
      })
      expect(chatStoreState.updateContact).toHaveBeenCalledWith("c1", {
        tagCount: 4,
        tagPreview: [{ id: "t1", name: "alpha", color: "#1A2B3C" }],
      })
    })

    const contactQueryInvalidations = () =>
      invalidateQueriesMock.mock.calls.filter(([arg]) =>
        JSON.stringify(arg?.queryKey).includes("getContactAuthenticatedAPI"),
      )

    test("an event with the open contact invalidates that contact's query once", async () => {
      invalidateQueriesMock.mockClear()
      await renderWithStore(["c1", "c2"], "c1")

      act(() => emit("contactTagsChanged", { contactIds: ["c1", "c2"] }))
      await act(() => vi.advanceTimersByTimeAsync(500))

      const calls = contactQueryInvalidations()
      expect(calls).toHaveLength(1)
      expect(JSON.stringify(calls[0]?.[0].queryKey)).toContain("c1")
      expect(JSON.stringify(calls[0]?.[0].queryKey)).not.toContain("c2")
    })

    test("an event for other contacts only does not invalidate the open contact", async () => {
      invalidateQueriesMock.mockClear()
      await renderWithStore(["c1", "c2"], "c1")

      act(() => emit("contactTagsChanged", { contactIds: ["c2"] }))
      await act(() => vi.advanceTimersByTimeAsync(500))

      expect(contactQueryInvalidations()).toHaveLength(0)
    })

    test("an event for a row that is not loaded sends no request", async () => {
      await renderWithStore(["c1"])

      act(() => emit("contactTagsChanged", { contactIds: ["other"] }))
      await act(() => vi.advanceTimersByTimeAsync(2000))

      expect(
        clientMock.listContactTagPreviewsAuthenticatedAPI,
      ).not.toHaveBeenCalled()
    })
  })

  test("contactBlocked / contactUnblocked update the contact", async () => {
    await render()
    act(() => emit("contactBlocked", { contactId: "c1" }))
    expect(chatStoreState.updateContact).toHaveBeenCalledWith("c1", {
      blockedAt: expect.any(Date),
    })
    act(() => emit("contactUnblocked", { contactId: "c1" }))
    expect(chatStoreState.updateContact).toHaveBeenCalledWith("c1", {
      blockedAt: null,
    })
  })

  test("conversationAssigned updates the conversations", async () => {
    await render()
    act(() =>
      emit("conversationAssigned", {
        conversationIds: ["conv-1"],
        assignedUserId: "user-1",
        assignedInboxTeamId: null,
      }),
    )
    expect(chatStoreState.updateConversations).toHaveBeenCalledWith(
      ["conv-1"],
      {
        assignedUserId: "user-1",
        assignedInboxTeamId: null,
        assignedUser: null,
        assignedInboxTeam: null,
      },
    )
  })

  test("an assignment refreshes the list head only while the SLA is on (the deadline may move)", async () => {
    await render()
    const assigned = {
      conversationIds: ["conv-1"],
      assignedUserId: "user-1",
      assignedInboxTeamId: null,
    }

    act(() => emit("conversationAssigned", assigned))
    expect(
      chatStoreState.scheduleConversationHeadRefresh,
    ).not.toHaveBeenCalled()

    responseSlaState.enabled = true
    await render()
    act(() => emit("conversationAssigned", assigned))
    expect(chatStoreState.scheduleConversationHeadRefresh).toHaveBeenCalledWith(
      "workspace-1",
    )
    responseSlaState.enabled = false
  })

  test("a customer message refreshes the list head only while the SLA is on", async () => {
    const customerMessage = {
      id: "message-9",
      conversationId: "conversation-9",
      messageType: "incoming",
    }
    const agentMessage = {
      ...customerMessage,
      id: "message-10",
      messageType: "outgoing",
    }

    await render()
    await act(async () => {
      emit("messageCreated", customerMessage)
      await Promise.resolve()
    })
    expect(
      chatStoreState.scheduleConversationHeadRefresh,
    ).not.toHaveBeenCalled()

    responseSlaState.enabled = true
    await render()
    await act(async () => {
      emit("messageCreated", agentMessage)
      await Promise.resolve()
    })
    expect(
      chatStoreState.scheduleConversationHeadRefresh,
    ).not.toHaveBeenCalled()

    await act(async () => {
      emit("messageCreated", customerMessage)
      await Promise.resolve()
    })
    expect(chatStoreState.scheduleConversationHeadRefresh).toHaveBeenCalledWith(
      "workspace-1",
    )
    responseSlaState.enabled = false
  })

  describe("who replied", () => {
    const outgoing = (overrides: Record<string, unknown> = {}) => ({
      id: "message-1",
      conversationId: "conversation-1",
      messageType: "outgoing",
      senderType: "user",
      senderId: "user-1",
      contentAttributes: {},
      createdAt: "2026-11-20T10:00:00.000Z",
      ...overrides,
    })
    const emitCreated = (message: unknown) =>
      act(async () => {
        emit("messageCreated", message)
        await Promise.resolve()
      })

    test("a member's typed reply updates the row preview and the participants cache", async () => {
      await render()
      await emitCreated(outgoing())

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).toHaveBeenCalledWith("conversation-1", {
        userId: "user-1",
        name: "Hoàng",
        image: "avatar.png",
        lastRepliedAt: new Date("2026-11-20T10:00:00.000Z"),
      })
      expect(setQueryDataMock).toHaveBeenCalledOnce()
      expect(fetchQueryMock).not.toHaveBeenCalled()
    })

    test("a flow row stamped with the member counts too", async () => {
      await render()
      await emitCreated(
        outgoing({
          senderType: "bot",
          senderId: null,
          contentAttributes: { sentByUserId: "user-1" },
        }),
      )

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).toHaveBeenCalledOnce()
    })

    test.each([
      [
        "a customer message",
        { messageType: "incoming", senderType: "contact", senderId: null },
      ],
      ["a bot message", { senderType: "bot", senderId: null }],
      [
        "an API message without a member",
        { senderType: "api", senderId: null },
      ],
      ["a page echo without a member", { senderType: "user", senderId: null }],
    ])("%s changes nothing", async (_name, overrides) => {
      await render()
      await emitCreated(outgoing(overrides))

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).not.toHaveBeenCalled()
      expect(setQueryDataMock).not.toHaveBeenCalled()
      expect(fetchQueryMock).not.toHaveBeenCalled()
    })

    test("a member missing from the cache is looked up fresh, then applied", async () => {
      fetchQueryMock.mockResolvedValue({
        data: [{ userId: "user-9", user: { name: "Tàu", image: null } }],
      })
      await render()
      await emitCreated(outgoing({ senderId: "user-9" }))

      expect(fetchQueryMock).toHaveBeenCalledOnce()
      expect(
        chatStoreState.applyConversationParticipantReply,
      ).toHaveBeenCalledWith(
        "conversation-1",
        expect.objectContaining({ userId: "user-9", name: "Tàu" }),
      )
      expect(fetchInfiniteQueryMock).not.toHaveBeenCalled()
      expect(
        chatStoreState.scheduleConversationHeadRefresh,
      ).not.toHaveBeenCalled()
    })

    test("a member still missing from the fresh list falls back to the server's list", async () => {
      await render()
      await emitCreated(outgoing({ senderId: "user-9" }))

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).not.toHaveBeenCalled()
      expect(fetchInfiniteQueryMock).toHaveBeenCalledOnce()
      expect(
        chatStoreState.replaceConversationRecentParticipants,
      ).toHaveBeenCalledWith("conversation-1", [])
    })

    test("a message with an invalid time is ignored", async () => {
      await render()
      await emitCreated(outgoing({ createdAt: "not-a-date" }))

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).not.toHaveBeenCalled()
      expect(fetchQueryMock).not.toHaveBeenCalled()
    })

    test("a failed counted message refetches that conversation and fixes its row", async () => {
      const serverList = [
        {
          userId: "user-2",
          name: "Hùng",
          image: null,
          lastRepliedAt: new Date(),
        },
      ]
      fetchInfiniteQueryMock.mockResolvedValue({
        pages: [{ data: serverList }],
      })
      await render()
      await emitCreated(outgoing())
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: "boom",
        })
        await Promise.resolve()
      })

      expect(fetchInfiniteQueryMock).toHaveBeenCalledOnce()
      expect(
        chatStoreState.replaceConversationRecentParticipants,
      ).toHaveBeenCalledWith("conversation-1", serverList)
    })

    test("a removed counted message refetches the participants", async () => {
      await render()
      await emitCreated(outgoing())
      await act(async () => {
        emit("messageRemoved", { messageIds: ["message-1"] })
        await Promise.resolve()
      })

      expect(fetchInfiniteQueryMock).toHaveBeenCalledOnce()
    })

    test("a success confirmation (error null) never refetches the participants", async () => {
      await render()
      await emitCreated(outgoing())
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: null,
        })
        await Promise.resolve()
      })

      expect(fetchInfiniteQueryMock).not.toHaveBeenCalled()
    })

    test("a Resend that succeeds after a failure counts the reply again", async () => {
      await render()
      await emitCreated(outgoing())
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: "boom",
        })
        await Promise.resolve()
      })
      chatStoreState.applyConversationParticipantReply.mockClear()
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: null,
        })
        await Promise.resolve()
      })

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).toHaveBeenCalledWith(
        "conversation-1",
        expect.objectContaining({ userId: "user-1" }),
      )
    })

    test("a Resend after a reload counts the reply from the loaded message (its sendError is already cleared)", async () => {
      chatStoreState.findLoadedMessage.mockReturnValue(
        outgoing({ sendError: null }),
      )
      await render()
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: null,
        })
        await Promise.resolve()
      })

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).toHaveBeenCalledWith(
        "conversation-1",
        expect.objectContaining({ userId: "user-1" }),
      )
    })

    test("a success confirmation for a message this tab already counted adds nothing", async () => {
      chatStoreState.findLoadedMessage.mockReturnValue(outgoing())
      await render()
      await emitCreated(outgoing())
      chatStoreState.applyConversationParticipantReply.mockClear()
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: null,
        })
        await Promise.resolve()
      })

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).not.toHaveBeenCalled()
    })

    test("a success confirmation for a message that is not loaded counts nothing", async () => {
      chatStoreState.findLoadedMessage.mockReturnValue(undefined)
      await render()
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: null,
        })
        await Promise.resolve()
      })

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).not.toHaveBeenCalled()
    })

    test("a removed message is not counted again by a later confirmation", async () => {
      await render()
      await emitCreated(outgoing())
      await act(async () => {
        emit("messageRemoved", { messageIds: ["message-1"] })
        await Promise.resolve()
      })
      chatStoreState.applyConversationParticipantReply.mockClear()
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: null,
        })
        await Promise.resolve()
      })

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).not.toHaveBeenCalled()
    })

    test("a refetch after a failure keeps the other replies this tab counted", async () => {
      fetchInfiniteQueryMock.mockResolvedValue({
        pageParams: [undefined],
        pages: [{ data: [], nextCursor: null }],
      })
      await render()
      await emitCreated(outgoing())
      await emitCreated(
        outgoing({ id: "message-2", createdAt: "2026-11-20T10:05:00.000Z" }),
      )
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: "boom",
        })
        await Promise.resolve()
      })

      expect(
        chatStoreState.replaceConversationRecentParticipants,
      ).toHaveBeenCalledWith("conversation-1", [
        expect.objectContaining({
          userId: "user-1",
          lastRepliedAt: new Date("2026-11-20T10:05:00.000Z"),
        }),
      ])
    })

    test("a member lookup that resolves after the message failed does not restore it", async () => {
      let resolveMembers: (value: unknown) => void = () => undefined
      fetchQueryMock.mockReturnValue(
        new Promise((resolve) => {
          resolveMembers = resolve
        }),
      )
      await render()
      await emitCreated(outgoing({ senderId: "user-9" }))
      await act(async () => {
        emit("messageFailed", {
          messageId: "message-1",
          clientId: "c1",
          error: "boom",
        })
        await Promise.resolve()
      })
      await act(async () => {
        resolveMembers({
          data: [{ userId: "user-9", user: { name: "Tàu", image: null } }],
        })
        await Promise.resolve()
      })

      expect(
        chatStoreState.applyConversationParticipantReply,
      ).not.toHaveBeenCalled()
    })

    test("a failed or removed message that never counted costs nothing", async () => {
      await render()
      act(() =>
        emit("messageFailed", {
          messageId: "broadcast-1",
          clientId: "c1",
          error: "boom",
        }),
      )
      act(() => emit("messageRemoved", { messageIds: ["broadcast-2"] }))

      expect(fetchInfiniteQueryMock).not.toHaveBeenCalled()
      expect(invalidateQueriesMock).not.toHaveBeenCalled()
    })
  })

  test("conversationUpdated applies a valid agent read timestamp", async () => {
    await render()
    act(() =>
      emit("conversationUpdated", {
        conversationIds: ["conv-1", "conv-2"],
        changes: { agentLastReadAt: "2026-09-23T10:00:00.000Z" },
      }),
    )

    expect(chatStoreState.applyAgentLastReadAt).toHaveBeenCalledWith(
      ["conv-1", "conv-2"],
      new Date("2026-09-23T10:00:00.000Z"),
    )
  })

  test("conversationUpdated ignores a null agent read timestamp", async () => {
    await render()
    act(() =>
      emit("conversationUpdated", {
        conversationIds: ["conv-1"],
        changes: { agentLastReadAt: null },
      }),
    )

    expect(chatStoreState.applyAgentLastReadAt).not.toHaveBeenCalled()
  })

  test("contactInboxThreadControlUpdated patches the contact inbox of its conversation", async () => {
    await render()
    act(() =>
      emit("contactInboxThreadControlUpdated", {
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        threadControlState: "standby",
        threadOwnerRole: "ai_agent",
        threadControlUpdatedAt: "2026-09-29T10:00:00.000Z",
      }),
    )

    expect(chatStoreState.patchContactInboxThreadControl).toHaveBeenCalledWith(
      "conv-1",
      {
        contactInboxId: "ci-1",
        threadControlState: "standby",
        threadOwnerRole: "ai_agent",
        threadControlUpdatedAt: "2026-09-29T10:00:00.000Z",
      },
    )
  })

  test("conversationUpdated ignores a malformed agent read timestamp", async () => {
    await render()
    act(() =>
      emit("conversationUpdated", {
        conversationIds: ["conv-1"],
        changes: { agentLastReadAt: "not-a-date" },
      }),
    )

    expect(chatStoreState.applyAgentLastReadAt).not.toHaveBeenCalled()
  })
})

describe("ChatRealtime — call permission reply invalidates the outbound call mode", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("batches a call-permission reply into one message store update", async () => {
    await render()

    const message = {
      id: "message-1",
      conversationId: "conversation-42",
      contentAttributes: {
        type: "whatsapp_call_permission_reply",
        response: "accept",
      },
    }
    await act(async () => {
      emit("messageCreated", message)
      emit("messageCreated", { ...message, id: "message-2" })
      await Promise.resolve()
    })

    expect(chatStoreState.handleNewMessages).toHaveBeenCalledTimes(1)
    expect(chatStoreState.handleNewMessages).toHaveBeenCalledWith([
      message,
      { ...message, id: "message-2" },
    ])
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: [
        "whatsapp-outbound-call-mode",
        "workspace-1",
        "conversation-42",
      ],
    })
  })

  test("does not invalidate the call-mode query for a plain text message", async () => {
    await render()

    const message = {
      id: "message-2",
      conversationId: "conversation-42",
      contentAttributes: { type: "text" },
    }
    await act(async () => {
      emit("messageCreated", message)
      await Promise.resolve()
    })

    expect(chatStoreState.handleNewMessages).toHaveBeenCalledWith([message])
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  test("flushes a created message before its same-batch failure", async () => {
    await render()

    const message = {
      id: "message-3",
      conversationId: "conversation-42",
      contentAttributes: { type: "text" },
    }
    act(() => {
      emit("messageCreated", message)
      emit("messageFailed", {
        messageId: "message-3",
        error: "provider rejected",
      })
    })

    expect(chatStoreState.handleNewMessages).toHaveBeenCalledWith([message])
    expect(chatStoreState.markMessageFailed).toHaveBeenCalledWith(
      "message-3",
      undefined,
      "provider rejected",
    )
    expect(
      chatStoreState.handleNewMessages.mock.invocationCallOrder[0],
    ).toBeLessThan(chatStoreState.markMessageFailed.mock.invocationCallOrder[0])
  })
})

describe("ChatRealtime — bubble-to-top on ringing", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    bubbleConversationToTopMock.mockResolvedValue(undefined)
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("bubbles a conversation the first time its call appears in the ringing basket", async () => {
    await render()

    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging({
        ...baseVoipCall,
        whatsappCallId: "call-1",
        conversationId: "conversation-1",
      })
    })

    expect(bubbleConversationToTopMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-1",
    )
  })

  test("bubbles a call already ringing at mount time (covers the resume-after-refresh path)", async () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [
        {
          ...baseVoipCall,
          whatsappCallId: "call-1",
          conversationId: "conversation-1",
        },
      ],
    })

    await render()

    expect(bubbleConversationToTopMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-1",
    )
  })

  test("never bubbles the same whatsappCallId twice", async () => {
    await render()

    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging({
        ...baseVoipCall,
        whatsappCallId: "call-1",
        conversationId: "conversation-1",
      })
    })
    act(() => {
      // A store update that re-references the same whatsappCallId must not re-bubble it.
      useWhatsappVoipCallStore.setState((state) => ({
        ringingCalls: [...state.ringingCalls],
      }))
    })

    expect(bubbleConversationToTopMock).toHaveBeenCalledTimes(1)
  })

  test("under React Strict Mode, a call already ringing at mount is bubbled exactly once, not twice per synthetic remount", () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [
        {
          ...baseVoipCall,
          whatsappCallId: "call-1",
          conversationId: "conversation-1",
        },
      ],
    })

    act(() => {
      root.render(
        <StrictMode>
          <ChatRealtime />
        </StrictMode>,
      )
    })

    expect(bubbleConversationToTopMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-1",
    )
    expect(bubbleConversationToTopMock).toHaveBeenCalledTimes(1)
  })
})

describe("ChatRealtime — pendingConversationOpen bridge", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    openConversationMock.mockResolvedValue(true)
    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingConversationOpen: null,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("opens and clears a pending conversation set before mount", async () => {
    useWhatsappVoipCallStore
      .getState()
      .setPendingConversationOpen("conversation-9")

    await render()

    expect(openConversationMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-9",
    )
    expect(conversationIdParamMock.set).toHaveBeenCalledWith("conversation-9")
    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen,
    ).toBeNull()
  })

  test("opens and clears a pending conversation set after mount", async () => {
    await render()

    await act(async () => {
      useWhatsappVoipCallStore
        .getState()
        .setPendingConversationOpen("conversation-42")
      await Promise.resolve()
    })

    expect(openConversationMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-42",
    )
    expect(conversationIdParamMock.set).toHaveBeenCalledWith("conversation-42")
    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen,
    ).toBeNull()
  })

  // The URL param must never be synced when `openConversation` resolves false
  // (e.g. a concurrent bootstrap landed on a different conversation, or the
  // fetch failed) — otherwise the URL and the real selection disagree.
  test("does NOT sync the URL param when openConversation resolves unsuccessfully", async () => {
    openConversationMock.mockResolvedValue(false)
    useWhatsappVoipCallStore
      .getState()
      .setPendingConversationOpen("conversation-9")

    await render()
    await act(async () => {
      await Promise.resolve()
    })

    expect(openConversationMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-9",
    )
    expect(conversationIdParamMock.set).not.toHaveBeenCalled()
  })

  test("does nothing while pendingConversationOpen stays null", async () => {
    await render()

    expect(openConversationMock).not.toHaveBeenCalled()
    expect(conversationIdParamMock.set).not.toHaveBeenCalled()
  })

  test("C: a stale pending request (set long before the inbox mounted) is dropped, not reopened", async () => {
    useWhatsappVoipCallStore.setState({
      pendingConversationOpen: {
        conversationId: "conversation-stale",
        requestedAt: Date.now() - 60_000,
      },
    })

    await render()

    expect(openConversationMock).not.toHaveBeenCalled()
    expect(conversationIdParamMock.set).not.toHaveBeenCalled()
    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen,
    ).toBeNull()
  })
})
