import { beforeEach, describe, expect, test, vi } from "vitest"

const { dbTransactionSpy } = vi.hoisted(() => {
  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  const mockInsertReturning = vi.fn(async () => [])
  const mockOnConflict = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsertValues = vi.fn(() => ({
    onConflictDoNothing: mockOnConflict,
    returning: mockInsertReturning,
  }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const dbClient = { update: mockUpdate, insert: mockInsert }
  const dbTransactionSpy = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(dbClient),
  )

  return {
    dbTransactionSpy,
    mockInsertValues,
    mockUpdateReturning,
    mockUpdateSet,
    mockUpdateWhere,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: "and", conditions })),
  asc: vi.fn(),
  count: vi.fn(),
  db: { transaction: dbTransactionSpy },
  desc: vi.fn(),
  eq: vi.fn((field: unknown, value: unknown) => ({ op: "eq", field, value })),
  ilike: vi.fn(),
  lt: vi.fn((field: unknown, value: unknown) => ({ op: "lt", field, value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: "sql",
    strings: [...strings],
    values,
  })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { id: "Contact.id", fullName: "Contact.fullName" },
  conversationModel: {},
  minigameContactModel: {
    id: "MinigameContact.id",
    minigameId: "MinigameContact.minigameId",
    contactId: "MinigameContact.contactId",
    remaining: "MinigameContact.remaining",
    played: "MinigameContact.played",
    sharesCount: "MinigameContact.sharesCount",
    updatedAt: "MinigameContact.updatedAt",
  },
  minigameModel: { id: "Minigame.id", sharesCount: "Minigame.sharesCount" },
  minigamePlayModel: {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(),
}))
vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(),
  likeContains: vi.fn(),
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {},
  chatQueue: { add: vi.fn() },
  IntegrationJobAction: {},
  integrationQueue: { add: vi.fn() },
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))
vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: { setValues: vi.fn() },
}))
vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { updateTracking: vi.fn() },
}))
vi.mock("../src/conversation/service", () => ({
  conversationService: { findDMByContact: vi.fn() },
}))
const { mockAttachToContact } = vi.hoisted(() => ({
  mockAttachToContact: vi.fn(),
}))
vi.mock("../src/tag/service", () => ({
  tagService: { attachToContact: mockAttachToContact },
}))
const { mockEnqueueLeaderboardAward } = vi.hoisted(() => ({
  mockEnqueueLeaderboardAward: vi.fn().mockResolvedValue(true),
}))
vi.mock("../src/leaderboard/enqueue", () => ({
  enqueueLeaderboardAward: mockEnqueueLeaderboardAward,
}))
vi.mock("../src/minigame/service", () => ({
  minigameService: { find: vi.fn() },
}))

const { minigameContactService } = await import(
  "../src/minigame/minigame-contact-service"
)

const minigame = {
  id: "minigame-1",
  workspaceId: "ws-1",
  generalSettings: {
    playedAtFrom: "2000-01-01T00:00:00Z",
    playedAtTo: "2999-01-01T00:00:00Z",
    playerTagIds: [],
    newFriendTagIds: [],
  },
  playerSettings: {
    drawsPerPerson: 1,
    maxSharesPerPerson: 5,
    resetPolicy: "never",
  },
  prizeSettings: { nonWinning: { title: "No luck" } },
  winningMessageSettings: { outcomeMessage: { enabled: false } },
  nonWinningMessageSettings: { outcomeMessage: { enabled: false } },
} as never

const service = minigameContactService as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>

describe("minigame leaderboard awards", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockEnqueueLeaderboardAward.mockClear()
  })

  test("a prize win awards `minigameWin` keyed by the MinigamePlay row", async () => {
    const playedAt = new Date("2026-10-01T10:00:00Z")
    vi.spyOn(service, "recordPlay").mockResolvedValue({
      contactState: {},
      result: { type: "prize", prize: { id: "p-1", name: "Mug" } },
      play: { id: "play-1", createdAt: playedAt },
    })

    await minigameContactService.recordPlayAndDispatch({
      minigameId: "minigame-1",
      contactId: "contact-1",
      contactInbox: { id: "ci-1" } as never,
      minigame,
    })

    expect(mockEnqueueLeaderboardAward).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      minigameId: "minigame-1",
      rule: "minigameWin",
      sourceRef: "play-1",
      eventAt: playedAt,
    })
  })

  test("a losing play awards nothing", async () => {
    vi.spyOn(service, "recordPlay").mockResolvedValue({
      contactState: {},
      result: { type: "nonWinning" },
      play: { id: "play-2", createdAt: new Date() },
    })

    await minigameContactService.recordPlayAndDispatch({
      minigameId: "minigame-1",
      contactId: "contact-1",
      contactInbox: { id: "ci-1" } as never,
      minigame,
    })

    expect(mockEnqueueLeaderboardAward).not.toHaveBeenCalled()
  })

  test("a credited share awards `inGameShare` to the referrer, keyed by the invitee", async () => {
    const joinedAt = new Date("2026-10-01T11:00:00Z")
    vi.spyOn(service, "resolveOpenerPlayState").mockResolvedValue({
      state: { referrerContactId: "referrer-1", createdAt: joinedAt },
      created: true,
    })
    vi.spyOn(service, "grantReferralBonus").mockResolvedValue(true)

    const granted = await minigameContactService.creditSharedLinkReferral({
      minigame,
      contactId: "invitee-1",
      referrerContactId: "referrer-1",
    })

    expect(granted).toBe(true)
    expect(mockEnqueueLeaderboardAward).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "referrer-1",
      minigameId: "minigame-1",
      rule: "inGameShare",
      sourceRef: "invitee-1",
      eventAt: joinedAt,
    })
  })

  test("no share credit (cap reached) awards nothing", async () => {
    vi.spyOn(service, "resolveOpenerPlayState").mockResolvedValue({
      state: { referrerContactId: "referrer-1", createdAt: new Date() },
      created: true,
    })
    vi.spyOn(service, "grantReferralBonus").mockResolvedValue(false)

    await minigameContactService.creditSharedLinkReferral({
      minigame,
      contactId: "invitee-1",
      referrerContactId: "referrer-1",
    })

    expect(mockEnqueueLeaderboardAward).not.toHaveBeenCalled()
  })
})
