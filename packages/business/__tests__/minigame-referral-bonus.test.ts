import type { MinigamePlayerSettings } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  dbTransactionSpy,
  mockInsertValues,
  mockUpdateReturning,
  mockUpdateSet,
  mockUpdateWhere,
} = vi.hoisted(() => {
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
vi.mock("../src/tag/service", () => ({
  tagService: { attachToContact: vi.fn() },
}))
vi.mock("../src/minigame/service", () => ({
  minigameService: { find: vi.fn() },
}))

const { deriveRemaining, minigameContactService } = await import(
  "../src/minigame/minigame-contact-service"
)

const neverPolicy = (
  overrides: Partial<Extract<MinigamePlayerSettings, { resetPolicy: "never" }>>,
) =>
  ({
    drawsPerPerson: 1,
    maxSharesPerPerson: 0,
    resetPolicy: "never",
    ...overrides,
  }) as MinigamePlayerSettings

/**
 * `grantReferralBonus` is private; exercising it through the public entry
 * point keeps the test honest about how it is actually reached.
 */
const grant = (props: {
  playerSettings: MinigamePlayerSettings
  referrerContactId?: string
  inviteeContactId?: string
}) =>
  (
    minigameContactService as unknown as {
      grantReferralBonus: (input: {
        minigameId: string
        referrerContactId: string
        inviteeContactId: string
        playerSettings: MinigamePlayerSettings
      }) => Promise<boolean>
    }
  ).grantReferralBonus({
    minigameId: "minigame-1",
    referrerContactId: props.referrerContactId ?? "referrer-1",
    inviteeContactId: props.inviteeContactId ?? "invitee-1",
    playerSettings: props.playerSettings,
  })

describe("deriveRemaining", () => {
  test("adds earned bonus draws on top of the configured allowance", () => {
    expect(
      deriveRemaining({
        playerSettings: neverPolicy({
          drawsPerPerson: 1,
          maxSharesPerPerson: 3,
        }),
        played: 1,
        sharesCount: 2,
      }),
    ).toBe(2)
  })

  test("clamps the bonus at the cap", () => {
    expect(
      deriveRemaining({
        playerSettings: neverPolicy({
          drawsPerPerson: 1,
          maxSharesPerPerson: 3,
        }),
        played: 0,
        sharesCount: 5,
      }),
    ).toBe(4)
  })

  test("lowering the cap claws back uncredited bonus draws", () => {
    expect(
      deriveRemaining({
        playerSettings: neverPolicy({
          drawsPerPerson: 1,
          maxSharesPerPerson: 1,
        }),
        played: 0,
        sharesCount: 3,
      }),
    ).toBe(2)
  })

  test("treats legacy playerSettings with no maxSharesPerPerson as no bonus", () => {
    const legacy = {
      drawsPerPerson: 2,
      resetPolicy: "never",
    } as unknown as MinigamePlayerSettings

    expect(
      deriveRemaining({ playerSettings: legacy, played: 0, sharesCount: 4 }),
    ).toBe(2)
  })

  test("never goes negative", () => {
    expect(
      deriveRemaining({
        playerSettings: neverPolicy({
          drawsPerPerson: 1,
          maxSharesPerPerson: 2,
        }),
        played: 10,
        sharesCount: 1,
      }),
    ).toBe(0)
  })
})

describe("MinigameContactService.grantReferralBonus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([{ id: "minigame-contact-1" }])
  })

  test("skips the grant when playerSettings predates maxSharesPerPerson", async () => {
    const legacy = {
      drawsPerPerson: 1,
      resetPolicy: "never",
    } as unknown as MinigamePlayerSettings

    await expect(grant({ playerSettings: legacy })).resolves.toBe(false)
    expect(dbTransactionSpy).not.toHaveBeenCalled()
  })

  test("skips the grant when the cap is 0", async () => {
    await expect(
      grant({ playerSettings: neverPolicy({ maxSharesPerPerson: 0 }) }),
    ).resolves.toBe(false)
    expect(dbTransactionSpy).not.toHaveBeenCalled()
  })

  test("skips the grant on self-referral", async () => {
    await expect(
      grant({
        playerSettings: neverPolicy({ maxSharesPerPerson: 3 }),
        referrerContactId: "same-contact",
        inviteeContactId: "same-contact",
      }),
    ).resolves.toBe(false)
    expect(dbTransactionSpy).not.toHaveBeenCalled()
  })

  test("enforces the cap inside the UPDATE predicate, not by a prior read", async () => {
    await grant({ playerSettings: neverPolicy({ maxSharesPerPerson: 3 }) })

    const where = mockUpdateWhere.mock.calls[0]?.[0] as unknown as {
      conditions: { op: string; field: unknown; value: unknown }[]
    }
    expect(where.conditions).toContainEqual({
      op: "lt",
      field: "MinigameContact.sharesCount",
      value: 3,
    })
  })

  test("self-assigns updatedAt so the reset cycle and lastPlayedAt do not move", async () => {
    await grant({ playerSettings: neverPolicy({ maxSharesPerPerson: 3 }) })

    const set = mockUpdateSet.mock.calls[0]?.[0] as unknown as {
      updatedAt: { op: string; values: unknown[] }
    }
    expect(set.updatedAt).toMatchObject({
      op: "sql",
      values: ["MinigameContact.updatedAt"],
    })
  })

  test("bumps the minigame-wide total only when the per-contact credit lands", async () => {
    await grant({ playerSettings: neverPolicy({ maxSharesPerPerson: 3 }) })
    expect(mockUpdateSet).toHaveBeenCalledTimes(2)
    expect(mockUpdateSet.mock.calls[1]?.[0]).toMatchObject({
      sharesCount: { values: ["Minigame.sharesCount"] },
    })

    vi.clearAllMocks()
    // Referrer has no play state for this minigame, or is already at the cap.
    mockUpdateReturning.mockResolvedValue([])

    await expect(
      grant({ playerSettings: neverPolicy({ maxSharesPerPerson: 3 }) }),
    ).resolves.toBe(false)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
  })
})

describe("MinigameContactService.resolvePlayState — referral binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const resolveWithoutExistingRow = () => {
    const tx = {
      query: {
        minigameContactModel: { findFirst: vi.fn(async () => undefined) },
      },
      insert: vi.fn(() => ({ values: mockInsertValues })),
      update: vi.fn(() => ({ set: mockUpdateSet })),
    }
    return { tx }
  }

  test("stamps referrerContactId on the insert path", async () => {
    const { tx } = resolveWithoutExistingRow()
    mockInsertValues.mockReturnValueOnce({
      onConflictDoNothing: () => ({
        returning: async () => [{ id: "row-1", played: 0 }],
      }),
    })

    await minigameContactService.resolvePlayState({
      minigameId: "minigame-1",
      contactId: "invitee-1",
      playerSettings: neverPolicy({ maxSharesPerPerson: 3 }),
      referrerContactId: "referrer-1",
      tx: tx as never,
    })

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ referrerContactId: "referrer-1" }),
    )
  })

  test("drops a self-referral instead of stamping it", async () => {
    const { tx } = resolveWithoutExistingRow()
    mockInsertValues.mockReturnValueOnce({
      onConflictDoNothing: () => ({
        returning: async () => [{ id: "row-1", played: 0 }],
      }),
    })

    await minigameContactService.resolvePlayState({
      minigameId: "minigame-1",
      contactId: "same-contact",
      playerSettings: neverPolicy({ maxSharesPerPerson: 3 }),
      referrerContactId: "same-contact",
      tx: tx as never,
    })

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ referrerContactId: null }),
    )
  })

  test("never stamps a referrer onto an existing row", async () => {
    const existing = {
      id: "row-1",
      played: 1,
      remaining: 0,
      sharesCount: 0,
      referrerContactId: null,
      updatedAt: new Date(),
    }
    const tx = {
      query: {
        minigameContactModel: { findFirst: vi.fn(async () => existing) },
      },
      insert: vi.fn(),
      update: vi.fn(() => ({ set: mockUpdateSet })),
    }

    await minigameContactService.resolvePlayState({
      minigameId: "minigame-1",
      contactId: "veteran-1",
      playerSettings: neverPolicy({
        drawsPerPerson: 1,
        maxSharesPerPerson: 3,
      }),
      referrerContactId: "referrer-1",
      tx: tx as never,
    })

    expect(tx.insert).not.toHaveBeenCalled()
    for (const call of mockUpdateSet.mock.calls) {
      expect(call[0]).not.toHaveProperty("referrerContactId")
    }
  })
})
