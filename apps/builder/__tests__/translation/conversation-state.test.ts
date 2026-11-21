// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setTranslationOverride: vi.fn(),
  setTranslationLanguage: vi.fn(),
  queueRealtime: vi.fn(),
  getSettings: vi.fn(),
  toResource: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  // The real normalizer, so the test covers what the API would store.
  const { normalizeLanguageCode } = await import(
    "../../../../packages/business/src/translation/language-policy"
  )
  return {
    conversationService: {
      setTranslationOverride: mocks.setTranslationOverride,
      setTranslationLanguage: mocks.setTranslationLanguage,
    },
    inboxTranslationSettingsService: { get: mocks.getSettings },
    normalizeLanguageCode,
    queueWorkspaceRealtimeEvent: mocks.queueRealtime,
  }
})
vi.mock("@/features/translation/lib/availability", () => ({
  toConversationStateResource: mocks.toResource,
}))

const { updateConversationTranslationState } = await import(
  "@/features/translation/lib/conversation-state"
)

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  additionalAttributes: {},
} as any

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setTranslationOverride.mockResolvedValue(conversation)
  mocks.setTranslationLanguage.mockResolvedValue(conversation)
  mocks.toResource.mockReturnValue({ language: "es" })
})

describe("updateConversationTranslationState", () => {
  test.each([
    ["und"],
    ["hello"],
    ["1234"],
  ])("an invalid language (%s) is refused before the override is written", async (language) => {
    await expect(
      updateConversationTranslationState({
        workspaceId: "ws-1",
        conversation,
        request: { enabledOverride: false, language },
      }),
    ).rejects.toThrow()

    expect(mocks.setTranslationOverride).not.toHaveBeenCalled()
    expect(mocks.setTranslationLanguage).not.toHaveBeenCalled()
    expect(mocks.queueRealtime).not.toHaveBeenCalled()
  })

  test("writes both changes, storing the canonical language", async () => {
    await updateConversationTranslationState({
      workspaceId: "ws-1",
      conversation,
      request: { enabledOverride: false, language: "es-MX" },
    })

    expect(mocks.setTranslationOverride).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      enabledOverride: false,
    })
    expect(mocks.setTranslationLanguage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      language: "es",
    })
    expect(mocks.queueRealtime).toHaveBeenCalledOnce()
  })

  test("turning translation off tells every open inbox, without a language", async () => {
    await updateConversationTranslationState({
      workspaceId: "ws-1",
      conversation,
      request: { enabledOverride: false },
    })

    expect(mocks.queueRealtime).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: {
          conversationId: "conv-1",
          conversationEnabledOverride: false,
          items: [],
        },
      }),
    )
  })

  test("turning it on saves and sends `true`", async () => {
    await updateConversationTranslationState({
      workspaceId: "ws-1",
      conversation,
      request: { enabledOverride: true },
    })

    expect(mocks.setTranslationOverride).toHaveBeenCalledWith(
      expect.objectContaining({ enabledOverride: true }),
    )
    expect(mocks.queueRealtime).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({ conversationEnabledOverride: true }),
      }),
    )
  })

  test("clearing the choice sends `null`", async () => {
    await updateConversationTranslationState({
      workspaceId: "ws-1",
      conversation,
      request: { enabledOverride: null },
    })

    expect(mocks.queueRealtime).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({ conversationEnabledOverride: null }),
      }),
    )
  })
})
