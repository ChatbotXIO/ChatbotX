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
      { id: "ci-1", channel: "whatsapp", inboxId: "inbox-1" },
    ])

    const row = await contactInboxRepository.findByIdForWorkspace(
      { id: "ci-1", workspaceId: "ws-1" },
      { select: chain.select } as never,
    )

    expect(chain.select).toHaveBeenCalledWith({
      id: contactInboxModel.id,
      channel: contactInboxModel.channel,
      inboxId: contactInboxModel.inboxId,
    })
    expect(chain.innerJoin).toHaveBeenCalledWith(inboxModel, expect.anything())
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(row).toEqual({ id: "ci-1", channel: "whatsapp", inboxId: "inbox-1" })
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
