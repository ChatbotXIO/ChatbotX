import { describe, expect, test, vi } from "vitest"

vi.mock("@/lib/orpc/orpc", () => ({ client: {} }))
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { createChatStore } = await import(
  "../../src/features/chat/store/chat-store"
)

const NOW = new Date("2026-11-19T00:00:00.000Z")

const message = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  workspaceId: "ws-1",
  conversationId: "c1",
  contactInboxId: "ci-1",
  createdAt: NOW,
  updatedAt: NOW,
  messageType: "incoming",
  contentType: "text",
  type: "message",
  text: `text ${id}`,
  senderType: "contact",
  senderId: null,
  sourceId: null,
  contentAttributes: null,
  deletedAt: null,
  parentId: null,
  attributes: null,
  sendError: null,
  attachments: [],
  ...overrides,
})

const conversation = (additionalAttributes: unknown = null) => ({
  id: "c1",
  workspaceId: "ws-1",
  contactId: "contact-1",
  messages: [],
  lastActivityAt: NOW,
  additionalAttributes,
})

const storeWith = (
  messages: unknown[],
  conversations: unknown[] = [conversation()],
) =>
  createChatStore({
    activeConversationId: "c1",
    conversations: conversations as never,
    messagesSeed: {
      messages: messages as never,
      nextCursorMessage: null,
      hasNextMessagePage: false,
      messagesConversationId: "c1",
    },
  })

const stored = (store: ReturnType<typeof storeWith>, id: string) =>
  store.getState().messages.find((m) => m.id === id)

describe("applyMessageTranslations", () => {
  test("sets the translation of an inbound message, deriving its direction", () => {
    const store = storeWith([message("m1")])

    store.getState().applyMessageTranslations("c1", [
      {
        messageId: "m1",
        status: "translated",
        displayText: "Xin chào",
        sourceLanguage: "es",
        targetLanguage: "vi",
      },
    ])

    expect(stored(store, "m1")?.translation).toEqual({
      direction: "inbound",
      status: "translated",
      displayText: "Xin chào",
      sourceLanguage: "es",
      targetLanguage: "vi",
      failureCode: null,
    })
  })

  test("an outgoing message gets an outbound translation", () => {
    const store = storeWith([message("m1", { messageType: "outgoing" })])

    store.getState().applyMessageTranslations("c1", [
      {
        messageId: "m1",
        status: "translated",
        displayText: "câu agent gõ",
        targetLanguage: "es",
      },
    ])

    expect(stored(store, "m1")?.translation?.direction).toBe("outbound")
  })

  test("`removed` drops the translation", () => {
    const store = storeWith([
      message("m1", {
        translation: {
          direction: "inbound",
          status: "translated",
          displayText: "x",
          sourceLanguage: "es",
          targetLanguage: "vi",
          failureCode: null,
        },
      }),
    ])

    store
      .getState()
      .applyMessageTranslations("c1", [
        { messageId: "m1", status: "translated", removed: true },
      ])

    expect(stored(store, "m1")?.translation).toBeUndefined()
  })

  test("leaves messages it was not told about, and other conversations, alone", () => {
    const store = storeWith([
      message("m1"),
      message("m2", { conversationId: "other" }),
    ])

    store
      .getState()
      .applyMessageTranslations("c1", [
        { messageId: "m2", status: "translated", displayText: "x" },
      ])

    expect(stored(store, "m1")?.translation).toBeUndefined()
    expect(stored(store, "m2")?.translation).toBeUndefined()
  })

  test("a new conversation language is written without losing other attributes", () => {
    const store = storeWith(
      [],
      [conversation({ challenge: { type: "quickReply" } })],
    )

    store.getState().applyMessageTranslations("c1", [], "es")

    expect(store.getState().conversations[0]?.additionalAttributes).toEqual({
      challenge: { type: "quickReply" },
      translation: { language: "es", languageSource: "auto" },
    })
  })

  test("keeps a manual source and the conversation's own off switch when the language changes", () => {
    const store = storeWith(
      [],
      [
        conversation({
          translation: {
            enabledOverride: false,
            language: "fr",
            languageSource: "manual",
          },
        }),
      ],
    )

    store.getState().applyMessageTranslations("c1", [], "es")

    expect(store.getState().conversations[0]?.additionalAttributes).toEqual({
      translation: {
        enabledOverride: false,
        language: "es",
        languageSource: "manual",
      },
    })
  })
})

describe("applyMessageTranslations: translation turned off or on", () => {
  test("turned off keeps the language and its source", () => {
    const store = storeWith(
      [],
      [
        conversation({
          challenge: { type: "quickReply" },
          translation: { language: "es", languageSource: "manual" },
        }),
      ],
    )

    store.getState().applyMessageTranslations("c1", [], undefined, false)

    expect(store.getState().conversations[0]?.additionalAttributes).toEqual({
      challenge: { type: "quickReply" },
      translation: {
        enabledOverride: false,
        language: "es",
        languageSource: "manual",
      },
    })
  })

  test("turned back on clears the off switch", () => {
    const store = storeWith(
      [],
      [
        conversation({
          translation: {
            enabledOverride: false,
            language: "es",
            languageSource: "auto",
          },
        }),
      ],
    )

    store.getState().applyMessageTranslations("c1", [], undefined, null)

    expect(store.getState().conversations[0]?.additionalAttributes).toEqual({
      translation: { language: "es", languageSource: "auto" },
    })
  })
})

describe("attachSentTranslation", () => {
  const translation = {
    direction: "outbound" as const,
    status: "translated" as const,
    displayText: "câu agent gõ",
    sourceLanguage: "vi",
    targetLanguage: "es",
    failureCode: null,
  }

  test("finds the optimistic row by clientId", () => {
    const store = storeWith([
      message("optimistic-1", {
        messageType: "outgoing",
        clientId: "client-1",
      }),
    ])

    store
      .getState()
      .attachSentTranslation({ clientId: "client-1", translation })

    expect(stored(store, "optimistic-1")?.translation).toEqual(translation)
  })

  test("finds the real row by its id once realtime replaced the optimistic one", () => {
    const store = storeWith([message("real-1", { messageType: "outgoing" })])

    store.getState().attachSentTranslation({
      messageId: "real-1",
      clientId: "client-1",
      translation,
    })

    expect(stored(store, "real-1")?.translation).toEqual(translation)
  })

  test("does nothing when the message is not loaded", () => {
    const store = storeWith([message("m1")])
    const before = store.getState().messages

    store.getState().attachSentTranslation({ messageId: "gone", translation })

    expect(store.getState().messages).toBe(before)
  })
})

describe("messages whose text changes or that arrive", () => {
  test("an edit drops the stale translation at once", () => {
    const store = storeWith([
      message("m1", {
        translation: {
          direction: "inbound",
          status: "translated",
          displayText: "old translation",
          sourceLanguage: "es",
          targetLanguage: "vi",
          failureCode: null,
        },
      }),
    ])

    store.getState().updateMessageText("m1", "new text")

    expect(stored(store, "m1")?.text).toBe("new text")
    expect(stored(store, "m1")?.translation).toBeUndefined()
  })

  test("the real message replacing an optimistic bubble keeps the translation the send returned", () => {
    const store = storeWith([
      message("optimistic-1", {
        messageType: "outgoing",
        contactInboxId: "",
        clientId: "client-1",
        translation: {
          direction: "outbound",
          status: "translated",
          displayText: "câu agent gõ",
          sourceLanguage: "vi",
          targetLanguage: "es",
          failureCode: null,
        },
      }),
    ])

    store.getState().handleNewMessages([
      message("real-1", {
        messageType: "outgoing",
        clientId: "client-1",
        text: "Sí, le cambio a talla M",
      }) as never,
    ])

    const replaced = stored(store, "real-1")
    expect(replaced?.text).toBe("Sí, le cambio a talla M")
    expect(replaced?.translation?.displayText).toBe("câu agent gõ")
  })
})
