import type { MinigameOutcomeMessage } from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockChatQueueAdd,
  mockFindDMByContact,
  mockRepositoryCreate,
  mockUpdateWhere,
  mockUpdateTracking,
  mockWarn,
} = vi.hoisted(() => ({
  mockChatQueueAdd: vi.fn(),
  mockFindDMByContact: vi.fn(),
  mockRepositoryCreate: vi.fn(),
  mockUpdateWhere: vi.fn(async () => undefined),
  mockUpdateTracking: vi.fn(),
  mockWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  count: vi.fn(),
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: mockUpdateWhere })),
    })),
  },
  desc: vi.fn(),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  ilike: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { id: "id" },
  conversationModel: { id: "id" },
  minigameContactModel: { id: "id" },
  minigameModel: { id: "id" },
  minigamePlayModel: { id: "id" },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(async () => ({
    create: mockRepositoryCreate,
  })),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendChannelMessage: "sendChannelMessage" },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: vi.fn() },
}))

vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {},
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { updateTracking: mockUpdateTracking },
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: { findDMByContact: mockFindDMByContact },
}))

vi.mock("../src/tag/service", () => ({ tagService: {} }))

vi.mock("../src/minigame/service", () => ({ minigameService: {} }))

vi.mock("../src/logger", () => ({
  logger: { warn: mockWarn, error: vi.fn(), info: vi.fn() },
}))

const { minigameContactService } = await import(
  "../src/minigame/minigame-contact-service"
)

const contactInbox = {
  id: "contact-inbox-1",
  contactId: "contact-1",
} as ContactInboxModel

const textOutcome = (text: string): MinigameOutcomeMessage =>
  ({ enabled: true, mode: "text", text }) as MinigameOutcomeMessage

const sendWin = (
  text: string,
  resolveContactVariables?: (value: string) => Promise<string>,
) =>
  minigameContactService.sendWinMessage({
    workspaceId: "workspace-1",
    contactId: "contact-1",
    contactInbox,
    prizeName: "Áo thun",
    outcomeMessage: textOutcome(text),
    ...(resolveContactVariables ? { resolveContactVariables } : {}),
  })

const sentText = (): string => mockRepositoryCreate.mock.calls[0]?.[0]?.text

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  // 0 always selects the first spintax branch.
  vi.spyOn(Math, "random").mockReturnValue(0)
  mockFindDMByContact.mockResolvedValue({ id: "conversation-1" })
  mockRepositoryCreate.mockResolvedValue({
    id: "message-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  })
})

describe("minigame outcome message — text mode", () => {
  test("spins, substitutes the prize name, then resolves contact variables", async () => {
    await sendWin(
      "{Chúc mừng|Xin chúc mừng} {{first_name}}! {{prize_name}}",
      (text) => Promise.resolve(text.replaceAll("{{first_name}}", "Nam")),
    )

    expect(sentText()).toBe("Chúc mừng Nam! Áo thun")
  })

  // The order matters: a prize name or contact field carrying `{a|b}` is data,
  // and spinning it would rewrite words nobody authored.
  test("never spins the prize name it substitutes", async () => {
    await minigameContactService.sendWinMessage({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInbox,
      prizeName: "Combo {áo|quần}",
      outcomeMessage: textOutcome("Bạn trúng {{prize_name}}"),
    })

    expect(sentText()).toBe("Bạn trúng Combo {áo|quần}")
  })

  test("resolves {{prize_name}} with no resolver injected", async () => {
    await sendWin("Bạn trúng {{prize_name}}")

    expect(sentText()).toBe("Bạn trúng Áo thun")
  })

  // Without a resolver the placeholder stays literal — the behaviour this
  // message had before contact variables were wired up.
  test("leaves a contact variable literal with no resolver injected", async () => {
    await sendWin("Chào {{first_name}}")

    expect(sentText()).toBe("Chào {{first_name}}")
  })

  test("falls back to the unresolved text when the resolver throws", async () => {
    await sendWin("{Chúc mừng|Xin chúc mừng} {{first_name}}", () =>
      Promise.reject(new Error("db down")),
    )

    expect(sentText()).toBe("Chúc mừng {{first_name}}")
    expect(mockWarn).toHaveBeenCalled()
    // The message still ships: a failed lookup must not cost the player the
    // prize message they just earned.
    expect(mockChatQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("persists the same text it enqueues", async () => {
    await sendWin("{Chúc mừng|Xin chúc mừng} bạn")

    expect(sentText()).toBe("Chúc mừng bạn")
    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "sendChannelMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.objectContaining({ id: "message-1" }),
        }),
      }),
    )
  })
})
