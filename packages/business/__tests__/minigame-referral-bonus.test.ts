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
const { mockAttachToContact } = vi.hoisted(() => ({
  mockAttachToContact: vi.fn(),
}))
vi.mock("../src/tag/service", () => ({
  tagService: { attachToContact: mockAttachToContact },
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

describe("MinigameContactService.creditSharedLinkReferral", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000

  const minigame = (
    playerSettings: MinigamePlayerSettings,
    generalSettings: Record<string, unknown> = {},
  ) =>
    ({
      id: "minigame-1",
      workspaceId: "workspace-1",
      playerSettings,
      generalSettings: {
        newFriendTagIds: ["tag-1"],
        playedAtFrom: new Date(Date.now() - ONE_DAY_MS).toISOString(),
        playedAtTo: new Date(Date.now() + ONE_DAY_MS).toISOString(),
        ...generalSettings,
      },
    }) as never

  const stubResolveOpenerPlayState = (
    result: { state: unknown; created: boolean } | Error,
  ) =>
    vi
      .spyOn(minigameContactService, "resolveOpenerPlayState")
      .mockImplementation(
        result instanceof Error
          ? () => Promise.reject(result)
          : () => Promise.resolve(result as never),
      )

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([{ id: "minigame-contact-1" }])
  })

  test("credits when this call created the invitee's row", async () => {
    stubResolveOpenerPlayState({
      state: { id: "row-1", referrerContactId: "referrer-1" },
      created: true,
    })

    await expect(
      minigameContactService.creditSharedLinkReferral({
        minigame: minigame(neverPolicy({ maxSharesPerPerson: 3 })),
        contactId: "invitee-1",
        referrerContactId: "referrer-1",
      }),
    ).resolves.toBe(true)

    // Per-contact credit, then the minigame-wide total.
    expect(mockUpdateSet).toHaveBeenCalledTimes(2)
    expect(mockAttachToContact).toHaveBeenCalledWith(
      expect.objectContaining({ tagIds: ["tag-1"], contactId: "invitee-1" }),
    )
  })

  // An existing row means the invitee has opened or played this minigame
  // before, which is exactly the condition that disqualifies the referral.
  test("never credits when the invitee already had a row", async () => {
    stubResolveOpenerPlayState({
      state: { id: "row-1", referrerContactId: "referrer-1" },
      created: false,
    })

    await expect(
      minigameContactService.creditSharedLinkReferral({
        minigame: minigame(neverPolicy({ maxSharesPerPerson: 3 })),
        contactId: "invitee-1",
        referrerContactId: "referrer-1",
      }),
    ).resolves.toBe(false)

    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockAttachToContact).not.toHaveBeenCalled()
  })

  test("returns early on self-referral without touching the database", async () => {
    const spy = stubResolveOpenerPlayState({ state: {}, created: true })

    await expect(
      minigameContactService.creditSharedLinkReferral({
        minigame: minigame(neverPolicy({ maxSharesPerPerson: 3 })),
        contactId: "same-contact",
        referrerContactId: "same-contact",
      }),
    ).resolves.toBe(false)

    expect(spy).not.toHaveBeenCalled()
    expect(dbTransactionSpy).not.toHaveBeenCalled()
  })

  // Tagging is about the friend arriving, not about whether the referrer
  // still had cap left — otherwise every friend after the cap is silently
  // never tagged.
  test("still tags the invitee when the referrer was already at the cap", async () => {
    stubResolveOpenerPlayState({
      state: { id: "row-1", referrerContactId: "referrer-1" },
      created: true,
    })
    // The capped UPDATE matches no row.
    mockUpdateReturning.mockResolvedValue([])

    await expect(
      minigameContactService.creditSharedLinkReferral({
        minigame: minigame(neverPolicy({ maxSharesPerPerson: 3 })),
        contactId: "invitee-1",
        referrerContactId: "referrer-1",
      }),
    ).resolves.toBe(false)

    expect(mockAttachToContact).toHaveBeenCalledWith(
      expect.objectContaining({ tagIds: ["tag-1"], contactId: "invitee-1" }),
    )
  })

  // `enabled` stays true after a campaign ends, so the window is what stops a
  // stale share link from creating rows, inflating `participantsCount` and
  // handing out bonus draws `recordPlay` would refuse to spend.
  test("never credits outside the configured play window", async () => {
    const spy = stubResolveOpenerPlayState({
      state: { id: "row-1", referrerContactId: "referrer-1" },
      created: true,
    })

    await expect(
      minigameContactService.creditSharedLinkReferral({
        minigame: minigame(neverPolicy({ maxSharesPerPerson: 3 }), {
          playedAtTo: new Date(Date.now() - ONE_DAY_MS).toISOString(),
        }),
        contactId: "invitee-1",
        referrerContactId: "referrer-1",
      }),
    ).resolves.toBe(false)

    expect(spy).not.toHaveBeenCalled()
    expect(mockAttachToContact).not.toHaveBeenCalled()
    expect(dbTransactionSpy).not.toHaveBeenCalled()
  })

  // The grant must commit separately from the row-creating transaction, or it
  // deadlocks against a concurrent play by the referrer themselves.
  test("grants in a transaction of its own, not the caller's", async () => {
    stubResolveOpenerPlayState({
      state: { id: "row-1", referrerContactId: "referrer-1" },
      created: true,
    })

    await minigameContactService.creditSharedLinkReferral({
      minigame: minigame(neverPolicy({ maxSharesPerPerson: 3 })),
      contactId: "invitee-1",
      referrerContactId: "referrer-1",
    })

    expect(dbTransactionSpy).toHaveBeenCalledTimes(1)
  })
})
