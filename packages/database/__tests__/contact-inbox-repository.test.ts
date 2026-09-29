import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { contactInboxRepository } from "../src/repositories/contact-inbox/repository"
import {
  contactInboxModel,
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../src/schema"

type Chain = {
  select: ReturnType<typeof vi.fn>
  from: ReturnType<typeof vi.fn>
  innerJoin: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
}

function createQueryChain(result: unknown[]): Chain {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
  } satisfies Chain

  chain.select.mockReturnValue(chain)
  chain.from.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  chain.where.mockResolvedValue(result)

  return chain
}

describe("contactInboxRepository.updateIdentityGuarded", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the updated row from a guarded identity compare-and-swap", async () => {
    const updated = {
      id: "ci-1",
      sourceId: "user.bsuid-new",
      sourceUserId: "user.bsuid-new",
      sourceParentUserId: "parent.bsuid-1",
    }
    const chain = {
      update: vi.fn(),
      set: vi.fn(),
      where: vi.fn(),
      returning: vi.fn(),
    }
    chain.update.mockReturnValue(chain)
    chain.set.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.returning.mockResolvedValue([updated])
    const changedAt = "2026-09-28T05:00:00.000Z"

    const row = await contactInboxRepository.updateIdentityGuarded(
      {
        id: "ci-1",
        guard: {
          sourceUserId: "user.bsuid-old",
          sourceParentUserId: "parent.bsuid-1",
        },
        set: {
          sourceId: "user.bsuid-new",
          sourceUserId: "user.bsuid-new",
        },
        appendIdentityHistory: { changedAt, reason: "userIdChanged" },
      },
      { update: chain.update } as never,
    )

    expect(chain.update).toHaveBeenCalledWith(contactInboxModel)
    expect(chain.set).toHaveBeenCalledWith({
      sourceId: "user.bsuid-new",
      sourceUserId: "user.bsuid-new",
      sourceIdentityHistory: expect.anything(),
    })
    const setArg = chain.set.mock.calls[0]?.[0]
    const rendered = new PgDialect().sqlToQuery(
      setArg.sourceIdentityHistory as never,
    )
    const normalizedSql = rendered.sql.replace(/\s+/g, " ").trim()
    expect(normalizedSql).toContain(
      'COALESCE("ContactInbox"."sourceIdentityHistory", \'[]\'::jsonb)',
    )
    expect(normalizedSql).toContain(
      'jsonb_build_object( \'sourceId\', "ContactInbox"."sourceId"',
    )
    expect(normalizedSql).toContain(
      '\'sourceUserId\', "ContactInbox"."sourceUserId"',
    )
    expect(normalizedSql).toContain(
      '\'sourceParentUserId\', "ContactInbox"."sourceParentUserId"',
    )
    expect(normalizedSql).toContain('ORDER BY "ordinality" DESC LIMIT $3')
    expect(rendered.params).toEqual([changedAt, "userIdChanged", 10])
    expect(chain.where).toHaveBeenCalledTimes(1)
    expect(row).toEqual(updated)
  })

  test("derives each disjoint update history entry from the row at update time", async () => {
    const sets: Record<string, unknown>[] = []
    const createUpdateChain = () => {
      const chain = {
        set: vi.fn((value: Record<string, unknown>) => {
          sets.push(value)
          return chain
        }),
        where: vi.fn(() => chain),
        returning: vi.fn().mockResolvedValue([{ id: "ci-1" }]),
      }
      return chain
    }
    const tx = {
      update: vi
        .fn()
        .mockImplementationOnce(createUpdateChain)
        .mockImplementationOnce(createUpdateChain),
    }

    await contactInboxRepository.updateIdentityGuarded(
      {
        id: "ci-1",
        guard: { sourceUserId: "user.bsuid-old" },
        set: { sourceUserId: "user.bsuid-new" },
        appendIdentityHistory: {
          changedAt: "2026-09-28T05:00:00.000Z",
          reason: "userIdChanged",
        },
      },
      tx as never,
    )
    await contactInboxRepository.updateIdentityGuarded(
      {
        id: "ci-1",
        guard: { sourceId: "84900000001" },
        set: { sourceId: "84900000002" },
        appendIdentityHistory: {
          changedAt: "2026-09-28T05:00:01.000Z",
          reason: "phoneChanged",
        },
      },
      tx as never,
    )

    expect(sets).toHaveLength(2)
    for (const set of sets) {
      const rendered = new PgDialect().sqlToQuery(
        set.sourceIdentityHistory as never,
      )
      expect(rendered.sql).toContain(
        'COALESCE("ContactInbox"."sourceIdentityHistory", \'[]\'::jsonb)',
      )
      expect(rendered.sql).toContain('"ContactInbox"."sourceId"')
      expect(rendered.sql).toContain('"ContactInbox"."sourceUserId"')
      expect(rendered.sql).toContain('"ContactInbox"."sourceParentUserId"')
    }
    expect(sets[0]?.sourceIdentityHistory).not.toBe(
      sets[1]?.sourceIdentityHistory,
    )
  })

  test("returns undefined when the stored identity no longer matches the guard", async () => {
    const chain = {
      update: vi.fn(),
      set: vi.fn(),
      where: vi.fn(),
      returning: vi.fn(),
    }
    chain.update.mockReturnValue(chain)
    chain.set.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.returning.mockResolvedValue([])

    await expect(
      contactInboxRepository.updateIdentityGuarded(
        {
          id: "ci-1",
          guard: {
            sourceUserId: null,
            sourceParentUserId: "parent.bsuid-1",
          },
          set: { sourceUserId: "user.bsuid-new" },
        },
        { update: chain.update } as never,
      ),
    ).resolves.toBeUndefined()
  })

  test("throws without issuing an update when called without an identity guard", async () => {
    const update = vi.fn()

    await expect(
      contactInboxRepository.updateIdentityGuarded(
        {
          id: "ci-1",
          guard: {} as never,
          set: { sourceUserId: "user.bsuid-new" },
        },
        { update } as never,
      ),
    ).rejects.toThrow("ContactInbox identity update requires a guard")

    expect(update).not.toHaveBeenCalled()
  })
})

describe("contactInboxRepository.findByIdForWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("joins Inbox scoped to the workspace and returns the single row", async () => {
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.innerJoin.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.limit.mockResolvedValue([
      {
        id: "ci-1",
        channel: "whatsapp",
        inboxId: "inbox-1",
        sourceId: "psid-1",
      },
    ])

    const row = await contactInboxRepository.findByIdForWorkspace(
      { id: "ci-1", workspaceId: "ws-1" },
      { select: chain.select } as never,
    )

    expect(chain.select).toHaveBeenCalledWith({
      id: contactInboxModel.id,
      channel: contactInboxModel.channel,
      inboxId: contactInboxModel.inboxId,
      // Selected so an error-log row can carry the channel-side contact id.
      sourceId: contactInboxModel.sourceId,
    })
    expect(chain.innerJoin).toHaveBeenCalledWith(inboxModel, expect.anything())
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(row).toEqual({
      id: "ci-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      sourceId: "psid-1",
    })
  })

  test("returns null when no row matches (missing id or wrong workspace)", async () => {
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.innerJoin.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.limit.mockResolvedValue([])

    const row = await contactInboxRepository.findByIdForWorkspace(
      { id: "ci-missing", workspaceId: "ws-1" },
      { select: chain.select } as never,
    )

    expect(row).toBeNull()
  })
})

describe("contactInboxRepository.listWhatsappCtwaInboxesByContact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("joins IntegrationWhatsapp scoped to the workspace and selects contactInbox/integration ids", async () => {
    const chain = createQueryChain([
      { contactInboxId: "ci-1", integrationWhatsappId: "iw-1" },
    ])

    const rows = await contactInboxRepository.listWhatsappCtwaInboxesByContact(
      { workspaceId: "ws-1", contactId: "contact-1" },
      { select: chain.select } as never,
    )

    expect(chain.select).toHaveBeenCalledWith({
      contactInboxId: contactInboxModel.id,
      integrationWhatsappId: integrationWhatsappModel.id,
    })
    expect(chain.innerJoin).toHaveBeenCalledWith(
      integrationWhatsappModel,
      expect.anything(),
    )
    expect(chain.where).toHaveBeenCalledTimes(1)
    expect(rows).toEqual([
      { contactInboxId: "ci-1", integrationWhatsappId: "iw-1" },
    ])
  })
})

describe("contactInboxRepository.listWhatsappCtwaInboxesByContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns [] without querying when contactIds is empty", async () => {
    const selectSpy = vi.fn()

    const rows = await contactInboxRepository.listWhatsappCtwaInboxesByContacts(
      { workspaceId: "ws-1", contactIds: [] },
      { select: selectSpy } as never,
    )

    expect(rows).toEqual([])
    expect(selectSpy).not.toHaveBeenCalled()
  })

  test("runs a single batch query across all requested contact ids", async () => {
    const chain = createQueryChain([
      {
        contactId: "contact-1",
        contactInboxId: "ci-1",
        integrationWhatsappId: "iw-1",
      },
      {
        contactId: "contact-2",
        contactInboxId: "ci-2",
        integrationWhatsappId: "iw-2",
      },
    ])

    const rows = await contactInboxRepository.listWhatsappCtwaInboxesByContacts(
      { workspaceId: "ws-1", contactIds: ["contact-1", "contact-2"] },
      { select: chain.select } as never,
    )

    expect(chain.select).toHaveBeenCalledTimes(1)
    expect(chain.select).toHaveBeenCalledWith({
      contactId: contactInboxModel.contactId,
      contactInboxId: contactInboxModel.id,
      integrationWhatsappId: integrationWhatsappModel.id,
    })
    expect(chain.where).toHaveBeenCalledTimes(1)
    expect(rows).toEqual([
      {
        contactId: "contact-1",
        contactInboxId: "ci-1",
        integrationWhatsappId: "iw-1",
      },
      {
        contactId: "contact-2",
        contactInboxId: "ci-2",
        integrationWhatsappId: "iw-2",
      },
    ])
  })
})

describe("contactInboxRepository.listAdEligibleInboxesByContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns [] without querying when contactIds is empty", async () => {
    const selectSpy = vi.fn()

    const rows = await contactInboxRepository.listAdEligibleInboxesByContacts(
      { workspaceId: "ws-1", contactIds: [] },
      { select: selectSpy } as never,
    )

    expect(rows).toEqual([])
    expect(selectSpy).not.toHaveBeenCalled()
  })

  test("runs one query per ads-eligible channel and tags each row with its channel", async () => {
    const chain: Chain = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.innerJoin.mockReturnValue(chain)
    chain.where
      .mockResolvedValueOnce([
        {
          contactId: "contact-1",
          contactInboxId: "ci-1",
          integrationId: "iw-1",
        },
      ])
      .mockResolvedValueOnce([
        {
          contactId: "contact-1",
          contactInboxId: "ci-2",
          integrationId: "im-1",
        },
      ])
      .mockResolvedValueOnce([
        {
          contactId: "contact-2",
          contactInboxId: "ci-3",
          integrationId: "ii-1",
        },
      ])

    const rows = await contactInboxRepository.listAdEligibleInboxesByContacts(
      { workspaceId: "ws-1", contactIds: ["contact-1", "contact-2"] },
      { select: chain.select } as never,
    )

    expect(chain.select).toHaveBeenCalledTimes(3)
    expect(chain.innerJoin).toHaveBeenCalledWith(
      integrationWhatsappModel,
      expect.anything(),
    )
    expect(chain.innerJoin).toHaveBeenCalledWith(
      integrationMessengerModel,
      expect.anything(),
    )
    expect(chain.innerJoin).toHaveBeenCalledWith(
      integrationInstagramModel,
      expect.anything(),
    )
    expect(rows).toEqual([
      {
        contactId: "contact-1",
        contactInboxId: "ci-1",
        integrationId: "iw-1",
        channel: "whatsapp",
      },
      {
        contactId: "contact-1",
        contactInboxId: "ci-2",
        integrationId: "im-1",
        channel: "messenger",
      },
      {
        contactId: "contact-2",
        contactInboxId: "ci-3",
        integrationId: "ii-1",
        channel: "instagram",
      },
    ])
  })
})

describe("contactInboxRepository.findByInboxAndSourceIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const wireSelect = (rows: unknown[]) => {
    const chain = { select: vi.fn(), from: vi.fn(), where: vi.fn() }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.where.mockResolvedValue(rows)
    return chain
  }

  test("scopes by inbox, dedups the source ids, and returns the rows", async () => {
    const chain = wireSelect([
      {
        id: "ci-1",
        sourceId: "601234567890",
        lastIncomingMessageAt: null,
        createdAt: new Date("2026-01-01"),
      },
    ])

    const rows = await contactInboxRepository.findByInboxAndSourceIds(
      { inboxId: "inbox-1", sourceIds: ["601234567890", "601234567890"] },
      { select: chain.select } as never,
    )

    expect(chain.select).toHaveBeenCalledWith({
      id: contactInboxModel.id,
      sourceId: contactInboxModel.sourceId,
      lastIncomingMessageAt: contactInboxModel.lastIncomingMessageAt,
      createdAt: contactInboxModel.createdAt,
    })
    expect(chain.from).toHaveBeenCalledWith(contactInboxModel)
    expect(rows).toHaveLength(1)
  })

  test("makes no query at all for an empty id list", async () => {
    const chain = wireSelect([])

    await expect(
      contactInboxRepository.findByInboxAndSourceIds(
        { inboxId: "inbox-1", sourceIds: [] },
        { select: chain.select } as never,
      ),
    ).resolves.toEqual([])

    expect(chain.select).not.toHaveBeenCalled()
  })

  test("drops rows whose sourceId is null — they cannot be addressed by wa_id", async () => {
    const chain = wireSelect([
      {
        id: "ci-1",
        sourceId: null,
        lastIncomingMessageAt: null,
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "ci-2",
        sourceId: "601234567890",
        lastIncomingMessageAt: null,
        createdAt: new Date("2026-01-01"),
      },
    ])

    const rows = await contactInboxRepository.findByInboxAndSourceIds(
      { inboxId: "inbox-1", sourceIds: ["601234567890"] },
      { select: chain.select } as never,
    )

    expect(rows.map((row) => row.id)).toEqual(["ci-2"])
  })
})
