// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findDetailOrFail: vi.fn(),
  listContacts: vi.fn(),
  listContactInboxes: vi.fn(),
  requireContactPermissionScope: vi.fn(),
  resolveContactAvatarUrl: vi.fn(
    async (
      input: {
        contact: { avatar: string | null }
        contactInboxes?: { channel: string; id: string }[]
      },
      finalize: (key: string) => string | Promise<string>,
    ) => {
      if (input.contact.avatar) {
        return await finalize(input.contact.avatar)
      }
      const messengerInbox = input.contactInboxes?.find(
        (contactInbox) => contactInbox.channel === "messenger",
      )
      return messengerInbox
        ? `https://builder.example.com/media/avatar/${messengerInbox.id}`
        : null
    },
  ),
  resolveContactPermissionScope: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    listByContactIds: mocks.listContactInboxes,
  },
  contactService: {
    findDetailOrFail: mocks.findDetailOrFail,
    list: mocks.listContacts,
  },
  resolveContactAvatarUrl: mocks.resolveContactAvatarUrl,
}))

vi.mock("../src/features/contacts/permissions", () => ({
  maskContactEmailAndPhone: vi.fn((contact: unknown) => contact),
  requireContactPermissionScope: mocks.requireContactPermissionScope,
  resolveContactPermissionScope: mocks.resolveContactPermissionScope,
}))

const { getContact } = await import(
  "../src/features/contacts/queries/get-contact.query"
)
const { listContactsRSC } = await import(
  "../src/features/contacts/queries/list-contacts.queries"
)

const listResult = {
  data: [
    { id: "contact-1", workspaceId: "workspace-1", avatar: null },
    {
      id: "contact-2",
      workspaceId: "workspace-1",
      avatar: "avatars/contact-2.png",
    },
    { id: "contact-3", workspaceId: "workspace-1", avatar: null },
  ],
  pageCount: 1,
  totalCount: 3,
  totalCountCapped: false,
}

describe("Contacts avatar resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireContactPermissionScope.mockResolvedValue({
      canViewEmailAndPhone: true,
    })
    mocks.resolveContactPermissionScope.mockResolvedValue({
      canViewEmailAndPhone: true,
    })
  })

  test("batch-loads contact inboxes once for the Contacts page and resolves every avatar", async () => {
    mocks.listContacts.mockResolvedValue(listResult)
    mocks.listContactInboxes.mockResolvedValue([
      {
        id: "messenger-contact-inbox",
        contactId: "contact-1",
        channel: "messenger",
      },
      {
        id: "whatsapp-contact-inbox",
        contactId: "contact-3",
        channel: "whatsapp",
      },
    ])

    const result = await listContactsRSC({ workspaceId: "workspace-1" })

    expect(mocks.listContactInboxes).toHaveBeenCalledTimes(1)
    expect(mocks.listContactInboxes).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1", "contact-2", "contact-3"],
    })
    expect(result.data.map((contact) => contact.avatar)).toEqual([
      "https://builder.example.com/media/avatar/messenger-contact-inbox",
      "avatars/contact-2.png",
      null,
    ])
  })

  test("batch-loads the detail contact inboxes and resolves its avatar", async () => {
    mocks.findDetailOrFail.mockResolvedValue({
      id: "contact-1",
      workspaceId: "workspace-1",
      avatar: null,
      contactCustomFields: [],
      contactNotes: [],
      contactsOnSequences: [],
      conversation: null,
      tags: [],
    })
    mocks.listContactInboxes.mockResolvedValue([
      {
        id: "messenger-contact-inbox",
        contactId: "contact-1",
        channel: "messenger",
      },
    ])

    const result = await getContact(
      { workspaceId: "workspace-1", contactId: "contact-1" },
      { canViewEmailAndPhone: true, restrictToAssignedUserId: undefined },
    )

    expect(mocks.listContactInboxes).toHaveBeenCalledTimes(1)
    expect(mocks.listContactInboxes).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
    })
    expect(result.avatar).toBe(
      "https://builder.example.com/media/avatar/messenger-contact-inbox",
    )
  })
})
