// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createOutgoing: vi.fn(),
  recordOutbound: vi.fn(),
  getSettings: vi.fn(),
  findWorkspace: vi.fn(),
  publish: vi.fn(),
  translateText: vi.fn(),
  setTranslationOverride: vi.fn(),
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  resolveTranslationModel: vi.fn(),
  TranslationIntegrationUnavailableError: class extends Error {},
}))
vi.mock("@/features/translation/lib/translate-text", () => ({
  OUTBOUND_TRANSLATION_TIMEOUT_MS: 10_000,
  INTERACTIVE_TRANSLATION_TIMEOUT_MS: 15_000,
  translateText: mocks.translateText,
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  messageService: { createOutgoing: mocks.createOutgoing },
  conversationService: {
    setTranslationOverride: mocks.setTranslationOverride,
  },
  translationService: { recordOutbound: mocks.recordOutbound },
  inboxTranslationSettingsService: { get: mocks.getSettings },
  workspaceService: { find: mocks.findWorkspace },
  queueWorkspaceRealtimeEvent: mocks.publish,
}))

const { createOutgoingWithTranslation } = await import(
  "@/features/translation/lib/create-translated-outgoing"
)
const { sendOutgoing } = await import(
  "@/features/translation/lib/send-outgoing"
)

const MODEL = { provider: "openai", model: "gpt-x" }
const SENT_AT = new Date("2026-11-19T01:00:00.000Z")

const conversationWith = (translation?: Record<string, unknown>) =>
  ({
    id: "c1",
    workspaceId: "w1",
    assignedUserId: "u1",
    assignedInboxTeamId: null,
    additionalAttributes: translation ? { translation } : null,
  }) as never

const contactInbox = { id: "ci1", channel: "whatsapp" } as never

const send = (
  options: {
    conversation?: never
    input?: Record<string, unknown>
    editedTranslation?: { text: string; targetLanguage: string }
  } = {},
) =>
  createOutgoingWithTranslation({
    workspaceId: "w1",
    conversation: options.conversation ?? conversationWith({ language: "es" }),
    contactInbox,
    input: (options.input ?? {
      text: "Dạ, em đổi size M cho anh nhé",
    }) as never,
    editedTranslation: options.editedTranslation,
    user: { id: "u1" } as never,
    sendFrom: "inbox",
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSettings.mockResolvedValue({ enabled: true, modelConfig: MODEL })
  mocks.findWorkspace.mockResolvedValue({ id: "w1", language: "vi" })
  mocks.createOutgoing.mockResolvedValue({ id: "m1", createdAt: SENT_AT })
  mocks.recordOutbound.mockImplementation(
    (input: {
      agentText: string
      sourceLanguage: string
      targetLanguage: string
    }) =>
      Promise.resolve({
        messageId: "m1",
        direction: "outbound",
        status: "translated",
        displayText: input.agentText,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        failureCode: null,
      }),
  )
  mocks.translateText.mockResolvedValue({
    ok: true,
    text: "Sí, le cambio a talla M",
    modelId: "openai/gpt-x",
  })
})

describe("createOutgoingWithTranslation", () => {
  test("sends the translation once, keeps the agent's sentence for rules and for display", async () => {
    const result = await send()

    expect(mocks.createOutgoing).toHaveBeenCalledTimes(1)
    expect(mocks.createOutgoing.mock.calls[0]?.[0]).toMatchObject({
      sendFrom: "inbox",
      input: {
        text: "Sí, le cambio a talla M",
        automationText: "Dạ, em đổi size M cho anh nhé",
      },
    })
    expect(mocks.translateText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Dạ, em đổi size M cho anh nhé",
        targetLanguage: "es",
        channel: "whatsapp",
        timeoutMs: 10_000,
      }),
    )
    expect(mocks.recordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "c1",
        message: { id: "m1", createdAt: SENT_AT },
        agentText: "Dạ, em đổi size M cho anh nhé",
        sourceLanguage: "vi",
        targetLanguage: "es",
        modelId: "openai/gpt-x",
      }),
    )
    expect(result.translation).toMatchObject({
      direction: "outbound",
      displayText: "Dạ, em đổi size M cho anh nhé",
      targetLanguage: "es",
    })
    expect(result.translationFallback).toBeNull()
    expect(mocks.publish).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ eventType: "messageTranslationUpdated" }),
    )
  })

  test.each([
    [
      "translation is off for the workspace",
      () => mocks.getSettings.mockResolvedValue({ enabled: false }),
      "disabled",
    ],
  ])("falls back to the original when %s", async (_name, arrange, reason) => {
    arrange()

    const result = await send()

    expect(mocks.createOutgoing).toHaveBeenCalledTimes(1)
    expect(mocks.createOutgoing.mock.calls[0]?.[0].input).toEqual({
      text: "Dạ, em đổi size M cho anh nhé",
    })
    expect(result.translationFallback).toEqual({ reason })
    expect(mocks.translateText).not.toHaveBeenCalled()
    expect(mocks.recordOutbound).not.toHaveBeenCalled()
  })

  test("falls back when the customer's language is not known yet", async () => {
    const result = await send({ conversation: conversationWith() })

    expect(result.translationFallback).toEqual({ reason: "unknownLanguage" })
    expect(mocks.translateText).not.toHaveBeenCalled()
    expect(mocks.createOutgoing).toHaveBeenCalledTimes(1)
  })

  test("the conversation opting out disables it", async () => {
    const result = await send({
      conversation: conversationWith({
        language: "es",
        enabledOverride: false,
      }),
    })

    expect(result.translationFallback).toEqual({ reason: "disabled" })
  })

  test("a customer in the workspace language needs no translation and is not a fallback", async () => {
    const result = await send({
      conversation: conversationWith({ language: "vi" }),
    })

    expect(result.translationFallback).toBeNull()
    expect(result.translation).toBeNull()
    expect(mocks.translateText).not.toHaveBeenCalled()
    expect(mocks.createOutgoing).toHaveBeenCalledTimes(1)
  })

  test.each([
    "timeout",
    "rateLimited",
    "unsafeOutput",
    "tooLong",
    "emptyOutput",
    "notConfigured",
  ] as const)("a %s from the translator sends nothing and leaves translation on", async (code) => {
    mocks.translateText.mockResolvedValue({ ok: false, code })

    await expect(send()).rejects.toMatchObject({
      code: "translationNotSent",
      reason: code,
      conversationTranslation: "on",
      data: { reason: code, conversationTranslation: "on" },
    })

    expect(mocks.createOutgoing).not.toHaveBeenCalled()
    expect(mocks.recordOutbound).not.toHaveBeenCalled()
    expect(mocks.setTranslationOverride).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  test.each([
    "providerError",
    "integrationUnavailable",
  ] as const)("a %s (the AI provider failed) sends nothing and turns translation off for the conversation", async (code) => {
    mocks.translateText.mockResolvedValue({ ok: false, code })
    mocks.setTranslationOverride.mockResolvedValue(
      conversationWith({ language: "es", enabledOverride: false }),
    )

    await expect(send()).rejects.toMatchObject({
      code: "translationNotSent",
      reason: code,
      conversationTranslation: "off",
    })

    expect(mocks.createOutgoing).not.toHaveBeenCalled()
    expect(mocks.setTranslationOverride).toHaveBeenCalledWith({
      workspaceId: "w1",
      conversationId: "c1",
      enabledOverride: false,
    })
    // Every open inbox learns that translation is off.
    expect(mocks.publish).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "c1",
          conversationEnabledOverride: false,
        }),
      }),
    )
  })

  test("a provider failure whose turn-off write fails still sends nothing, and says translation is on", async () => {
    mocks.translateText.mockResolvedValue({ ok: false, code: "providerError" })
    mocks.setTranslationOverride.mockRejectedValue(new Error("db down"))

    await expect(send()).rejects.toMatchObject({
      code: "translationNotSent",
      conversationTranslation: "on",
    })
    expect(mocks.createOutgoing).not.toHaveBeenCalled()
  })

  describe("editedTranslation", () => {
    test("is sent as written, with no model call, when its language still matches", async () => {
      await send({
        editedTranslation: {
          text: "Claro, cambio a la M",
          targetLanguage: "es-MX",
        },
      })

      expect(mocks.translateText).not.toHaveBeenCalled()
      expect(mocks.createOutgoing.mock.calls[0]?.[0].input).toMatchObject({
        text: "Claro, cambio a la M",
        automationText: "Dạ, em đổi size M cho anh nhé",
      })
      expect(mocks.recordOutbound).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: null }),
      )
    })

    test("is discarded when the conversation language changed meanwhile: translated again, and reported", async () => {
      const result = await send({
        editedTranslation: { text: "Ça marche", targetLanguage: "fr" },
      })

      expect(mocks.translateText).toHaveBeenCalledTimes(1)
      expect(mocks.createOutgoing.mock.calls[0]?.[0].input.text).toBe(
        "Sí, le cambio a talla M",
      )
      expect(result.editedTranslationDiscarded).toBe(true)
    })

    test("longer than the channel accepts: nothing is sent", async () => {
      await expect(
        send({
          editedTranslation: { text: "x".repeat(5000), targetLanguage: "es" },
        }),
      ).rejects.toMatchObject({
        code: "translationNotSent",
        reason: "tooLong",
        conversationTranslation: "on",
      })

      expect(mocks.createOutgoing).not.toHaveBeenCalled()
    })
  })

  test("a send that fails leaves no row and no event", async () => {
    mocks.createOutgoing.mockRejectedValue(new Error("queue down"))

    await expect(send()).rejects.toThrow("queue down")

    expect(mocks.createOutgoing).toHaveBeenCalledTimes(1)
    expect(mocks.recordOutbound).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  test("failing to store the agent's sentence never fails a message that was already sent", async () => {
    mocks.recordOutbound.mockRejectedValue(new Error("db down"))

    const result = await send()

    expect(result.message).toMatchObject({ id: "m1" })
    expect(result.translation).toBeNull()
  })

  test.each([
    ["files", { text: "hi", files: [{}] }],
    ["a media file", { text: "hi", mediaFileId: "9" }],
    ["products", { products: {} }],
    ["a flow", { flowId: "9" }],
    ["a reply", { text: "hi", replyToMessageId: "9" }],
    ["a private reply", { text: "hi", isPrivateReply: true }],
    ["no text", { files: [] }],
  ])("refuses to translate %s", async (_name, input) => {
    await expect(send({ input })).rejects.toMatchObject({ code: "validation" })
    expect(mocks.createOutgoing).not.toHaveBeenCalled()
  })
})

describe("sendOutgoing", () => {
  const base = {
    workspaceId: "w1",
    conversation: conversationWith({ language: "es" }),
    contactInbox,
    sendFrom: "api" as const,
  }

  test("without translate it is createOutgoing untouched, minus the translate-only fields", async () => {
    const message = { id: "m9" }
    mocks.createOutgoing.mockResolvedValue(message)

    const result = await sendOutgoing({
      ...base,
      input: { text: "hola", editedTranslation: undefined },
    })

    expect(result).toBe(message)
    expect(mocks.createOutgoing).toHaveBeenCalledWith({
      conversation: base.conversation,
      contactInbox,
      sendFrom: "api",
      input: { text: "hola" },
    })
    expect(mocks.createOutgoing.mock.calls[0]?.[0]).not.toHaveProperty("user")
    expect(mocks.getSettings).not.toHaveBeenCalled()
    expect(mocks.translateText).not.toHaveBeenCalled()
  })

  test("translate: false is the same as leaving it out", async () => {
    await sendOutgoing({ ...base, input: { text: "hola", translate: false } })

    expect(mocks.getSettings).not.toHaveBeenCalled()
    expect(mocks.createOutgoing.mock.calls[0]?.[0].input).toEqual({
      text: "hola",
    })
  })

  test("with translate it returns the message with the translation fields", async () => {
    const result = await sendOutgoing({
      ...base,
      input: { text: "Dạ vâng", translate: true },
    })

    expect(result).toMatchObject({
      id: "m1",
      translation: { direction: "outbound" },
      translationFallback: null,
      editedTranslationDiscarded: false,
    })
  })
})
