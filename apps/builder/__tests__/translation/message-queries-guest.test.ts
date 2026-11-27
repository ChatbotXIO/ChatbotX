// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listForConversation: vi.fn(),
  findByIdWithUrls: vi.fn(),
  hasEverBeenEnabled: vi.fn(),
  findTranslations: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  messageService: {
    listForConversation: mocks.listForConversation,
    findByIdWithUrls: mocks.findByIdWithUrls,
  },
  inboxTranslationSettingsService: {
    hasEverBeenEnabled: mocks.hasEverBeenEnabled,
  },
  translationService: { findTranslations: mocks.findTranslations },
}))

const { listMessages, findMessage } = await import(
  "@/features/messages/queries"
)

const listInput = {
  workspaceId: "w1",
  conversationId: "c1",
  perPage: 20,
} as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasEverBeenEnabled.mockResolvedValue(true)
  mocks.findTranslations.mockResolvedValue([
    {
      messageId: "m1",
      direction: "outbound",
      status: "translated",
      displayText: "the agent's own sentence",
      sourceLanguage: "vi",
      targetLanguage: "es",
      failureCode: null,
    },
  ])
  mocks.listForConversation.mockResolvedValue({
    data: [{ id: "m1" }],
    nextCursor: null,
  })
  mocks.findByIdWithUrls.mockResolvedValue({ id: "m1" })
})

describe("message queries and translation", () => {
  test("the default read (the guest webchat history) never carries a translation or reads one", async () => {
    const result = await listMessages(listInput)

    expect(result.data).toEqual([{ id: "m1" }])
    expect(JSON.stringify(result)).not.toContain("agent's own sentence")
    expect(mocks.hasEverBeenEnabled).not.toHaveBeenCalled()
    expect(mocks.findTranslations).not.toHaveBeenCalled()
  })

  test("a member or API read asks for it and gets it", async () => {
    const result = await listMessages(listInput, { includeTranslation: true })

    expect(result.data[0]).toMatchObject({
      id: "m1",
      translation: { displayText: "the agent's own sentence" },
    })
  })

  test("a member read in a workspace that never used translation gets null and no extra query", async () => {
    mocks.hasEverBeenEnabled.mockResolvedValue(false)

    const result = await listMessages(listInput, { includeTranslation: true })

    expect(result.data[0]).toMatchObject({ id: "m1", translation: null })
    expect(mocks.findTranslations).not.toHaveBeenCalled()
  })

  test("findMessage follows the same opt-in", async () => {
    const input = {
      id: "m1",
      workspaceId: "w1",
      createdAt: new Date(),
    } as never

    expect(await findMessage(input)).toEqual({ id: "m1" })
    expect(
      await findMessage(input, { includeTranslation: true }),
    ).toMatchObject({ id: "m1", translation: { direction: "outbound" } })
  })
})
