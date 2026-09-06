import { beforeEach, describe, expect, test, vi } from "vitest"

const mockFindByPhone = vi.fn()
const mockContactInboxFindLatestBySource = vi.fn()
const mockContactInsert = vi.fn()
const mockCreateContactWithoutMac = vi.fn()
const mockWorkspaceFind = vi.fn()
const mockFindOrFail = vi.fn()
const mockEmit = vi.fn()
const mockEmitContactCreated = vi.fn()
const mockRecordAuditLog = vi.fn()
const mockCancelByInboxSource = vi.fn()

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: (...args: unknown[]) => mockRecordAuditLog(...args),
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: {
    findLatestBySource: (...args: unknown[]) =>
      mockContactInboxFindLatestBySource(...args),
  },
}))

vi.mock("../src/message-cleanup/service", () => ({
  messageCleanupService: {
    cancelByInboxSource: (...args: unknown[]) =>
      mockCancelByInboxSource(...args),
  },
}))

vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {
    createContactWithoutMac: (...args: unknown[]) =>
      mockCreateContactWithoutMac(...args),
  },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: {
    find: (...args: unknown[]) => mockWorkspaceFind(...args),
  },
}))

vi.mock("../src/contact/service", () => ({
  contactService: {
    findByPhone: (...args: unknown[]) => mockFindByPhone(...args),
    insert: (...args: unknown[]) => mockContactInsert(...args),
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: (...args: unknown[]) => mockFindOrFail(...args),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {},
  conversationModel: {},
  inboxModel: {},
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: (...args: unknown[]) => mockEmitContactCreated(...args),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "generated-id",
  }
})

vi.mock("remeda", () => ({
  randomString: () => "random",
}))

const { createContactWithInbox } = await import(
  "../src/contact/create-with-inbox"
)

const contact = {
  id: "contact-1",
  firstName: "Ada",
  phoneNumber: "+15551234567",
  email: "ada@example.com",
  createdAt: new Date("2026-06-01T00:00:00Z"),
}

const contactInbox = {
  id: "contact-inbox-1",
  source: "direct",
  sourceId: "source-1",
}

type InsertedContactInboxRow = Record<string, unknown> & {
  channel?: string
  inboxId?: string
  sourceId?: string
}

type CreateContactTestTx = {
  insert: () => {
    values: (row: InsertedContactInboxRow) => {
      returning: () => [typeof contactInbox]
    }
  }
}

type CreateContactQuotaArgs = {
  create: (tx: CreateContactTestTx) => Promise<unknown>
}

const mockCreateWithInsertedRows = () => {
  const insertedRows: InsertedContactInboxRow[] = []
  mockCreateContactWithoutMac.mockImplementation(
    (args: CreateContactQuotaArgs) => {
      const tx: CreateContactTestTx = {
        insert: () => ({
          values: (row) => {
            insertedRows.push(row)
            return {
              returning: () => [contactInbox],
            }
          },
        }),
      }
      return args.create(tx)
    },
  )
  return insertedRows
}

const baseInput = {
  email: "ada@example.com",
  firstName: "Ada",
  gender: "unknown" as const,
  inboxId: "inbox-1",
  phoneNumber: "+15551234567",
  channel: "webchat" as const,
  contactId: "",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindByPhone.mockResolvedValue(undefined)
  mockContactInboxFindLatestBySource.mockResolvedValue(undefined)
  mockFindOrFail.mockResolvedValue({ id: "inbox-1", channel: "webchat" })
  mockWorkspaceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  mockContactInsert.mockResolvedValue(contact)
  mockEmitContactCreated.mockResolvedValue(undefined)
  mockCancelByInboxSource.mockResolvedValue(undefined)
  mockCreateContactWithoutMac.mockImplementation(
    (args: CreateContactQuotaArgs) => {
      const tx: CreateContactTestTx = {
        insert: () => ({
          values: () => ({
            returning: () => [contactInbox],
          }),
        }),
      }
      return args.create(tx)
    },
  )
})

describe("contactService.createWithInbox", () => {
  test("creates manual contacts through the no-MAC quota helper", async () => {
    const result = await createContactWithInbox({
      workspaceId: "ws-1",
      input: baseInput,
    })

    expect(result.contact).toEqual(contact)
    expect(mockCreateContactWithoutMac).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        workspaceId: "ws-1",
      }),
    )
    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "create",
      detail: "created a new contact (#contact-1)",
    })
  })

  test("attaches manual contacts to the selected workspace inbox", async () => {
    const selectedInbox = { id: "messenger-inbox-1", channel: "messenger" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    const insertedRows = mockCreateWithInsertedRows()

    await createContactWithInbox({
      workspaceId: "ws-1",
      input: {
        ...baseInput,
        inboxId: selectedInbox.id,
        channel: "messenger",
        contactId: "psid-123",
      },
    })

    expect(mockFindOrFail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", id: selectedInbox.id },
      }),
    )
    expect(mockContactInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          email: "ada@example.com",
          firstName: "Ada",
          gender: "unknown",
          phoneNumber: "+15551234567",
        },
      }),
    )
    expect(insertedRows).toContainEqual(
      expect.objectContaining({
        channel: selectedInbox.channel,
        inboxId: selectedInbox.id,
        source: "direct",
        sourceId: "psid-123",
      }),
    )
  })

  test("uses WhatsApp phone digits as the source id", async () => {
    const selectedInbox = { id: "whatsapp-inbox-1", channel: "whatsapp" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    const insertedRows = mockCreateWithInsertedRows()

    await createContactWithInbox({
      workspaceId: "ws-1",
      input: {
        ...baseInput,
        email: "",
        inboxId: selectedInbox.id,
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(mockContactInboxFindLatestBySource).toHaveBeenCalledWith({
      inboxId: selectedInbox.id,
      sourceId: "15551234567",
      workspaceId: "ws-1",
    })
    expect(insertedRows).toContainEqual(
      expect.objectContaining({
        inboxId: selectedInbox.id,
        sourceId: "15551234567",
      }),
    )
  })

  test("normalizes local WhatsApp phone numbers with the workspace target country", async () => {
    const selectedInbox = { id: "whatsapp-inbox-1", channel: "whatsapp" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      targetCountry: "VN",
    })
    const insertedRows = mockCreateWithInsertedRows()

    await createContactWithInbox({
      workspaceId: "ws-1",
      input: {
        ...baseInput,
        email: "",
        inboxId: selectedInbox.id,
        phoneNumber: "0901234567",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(mockFindByPhone).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      phoneNumber: "+84901234567",
    })
    expect(mockContactInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phoneNumber: "+84901234567",
        }),
      }),
    )
    expect(mockContactInboxFindLatestBySource).toHaveBeenCalledWith({
      inboxId: selectedInbox.id,
      sourceId: "84901234567",
      workspaceId: "ws-1",
    })
    expect(insertedRows).toContainEqual(
      expect.objectContaining({
        inboxId: selectedInbox.id,
        sourceId: "84901234567",
      }),
    )
  })

  test.each([
    {
      name: "unset",
      workspace: { id: "ws-1", ownerId: "owner-1" },
    },
    {
      name: "unknown",
      workspace: { id: "ws-1", ownerId: "owner-1", targetCountry: "unknown" },
    },
  ])("requires a country code for local WhatsApp phone numbers when target country is $name", async ({
    workspace,
  }) => {
    const selectedInbox = { id: "whatsapp-inbox-1", channel: "whatsapp" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    mockWorkspaceFind.mockResolvedValue(workspace)

    await expect(
      createContactWithInbox({
        workspaceId: "ws-1",
        input: {
          ...baseInput,
          email: "",
          inboxId: selectedInbox.id,
          phoneNumber: "0901234567",
          channel: "whatsapp",
          contactId: "",
        },
      }),
    ).rejects.toMatchObject({
      field: "phoneNumber",
      message: "Please include the country code (e.g. +84)",
    })

    expect(mockContactInsert).not.toHaveBeenCalled()
    expect(mockCreateContactWithoutMac).not.toHaveBeenCalled()
  })

  test("uses email as the source id for SMTP contacts", async () => {
    const selectedInbox = { id: "smtp-inbox-1", channel: "smtp" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    const insertedRows = mockCreateWithInsertedRows()

    await createContactWithInbox({
      workspaceId: "ws-1",
      input: {
        ...baseInput,
        inboxId: selectedInbox.id,
        phoneNumber: "",
        channel: "smtp",
        contactId: "",
      },
    })

    expect(mockContactInboxFindLatestBySource).toHaveBeenCalledWith({
      inboxId: selectedInbox.id,
      sourceId: "ada@example.com",
      workspaceId: "ws-1",
    })
    expect(insertedRows).toContainEqual(
      expect.objectContaining({
        inboxId: selectedInbox.id,
        sourceId: "ada@example.com",
      }),
    )
  })

  test("uses a synthetic source id for webchat contacts", async () => {
    const selectedInbox = { id: "webchat-inbox-1", channel: "webchat" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    const insertedRows = mockCreateWithInsertedRows()

    await createContactWithInbox({
      workspaceId: "ws-1",
      input: {
        ...baseInput,
        email: "",
        inboxId: selectedInbox.id,
        phoneNumber: "",
        channel: "webchat",
        contactId: "",
      },
    })

    expect(mockContactInboxFindLatestBySource).not.toHaveBeenCalled()
    expect(insertedRows).toContainEqual(
      expect.objectContaining({
        inboxId: selectedInbox.id,
        sourceId: "randomgenerated-id",
      }),
    )
  })

  test("rejects when the selected inbox channel does not match the requested source", async () => {
    const selectedInbox = { id: "messenger-inbox-1", channel: "messenger" }
    mockFindOrFail.mockResolvedValue(selectedInbox)

    await expect(
      createContactWithInbox({
        workspaceId: "ws-1",
        input: {
          ...baseInput,
          email: "",
          inboxId: selectedInbox.id,
          channel: "whatsapp",
          contactId: "",
        },
      }),
    ).rejects.toMatchObject({
      field: "inboxId",
      message: "Selected inbox does not match the selected source",
    })

    expect(mockContactInboxFindLatestBySource).not.toHaveBeenCalled()
    expect(mockCreateContactWithoutMac).not.toHaveBeenCalled()
  })

  test("returns a field validation error when the selected inbox identity already exists", async () => {
    const selectedInbox = { id: "messenger-inbox-1", channel: "messenger" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    mockContactInboxFindLatestBySource.mockResolvedValue({
      id: "existing-contact-inbox-1",
    })

    await expect(
      createContactWithInbox({
        workspaceId: "ws-1",
        input: {
          ...baseInput,
          email: "",
          inboxId: selectedInbox.id,
          phoneNumber: "",
          channel: "messenger",
          contactId: "psid-123",
        },
      }),
    ).rejects.toMatchObject({
      field: "contactId",
      message: "This contact already exists on the selected inbox",
    })

    expect(mockCreateContactWithoutMac).not.toHaveBeenCalled()
  })

  test("dedups WhatsApp by the normalized phone number", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "whatsapp-inbox-1",
      channel: "whatsapp",
    })
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      targetCountry: "VN",
    })
    mockFindByPhone.mockResolvedValue({ id: "existing-contact" })

    await expect(
      createContactWithInbox({
        workspaceId: "ws-1",
        input: {
          ...baseInput,
          email: "",
          inboxId: "whatsapp-inbox-1",
          phoneNumber: "0901234567",
          channel: "whatsapp",
          contactId: "",
        },
      }),
    ).rejects.toMatchObject({
      field: "phoneNumber",
      message: "Phone number is exists",
    })

    expect(mockCreateContactWithoutMac).not.toHaveBeenCalled()
  })

  test("maps a duplicate WhatsApp wa_id to the phoneNumber field", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "whatsapp-inbox-1",
      channel: "whatsapp",
    })
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      targetCountry: "VN",
    })
    mockContactInboxFindLatestBySource.mockResolvedValue({ id: "existing-ci" })

    await expect(
      createContactWithInbox({
        workspaceId: "ws-1",
        input: {
          ...baseInput,
          email: "",
          inboxId: "whatsapp-inbox-1",
          phoneNumber: "0901234567",
          channel: "whatsapp",
          contactId: "",
        },
      }),
    ).rejects.toMatchObject({
      field: "phoneNumber",
      message: "This contact already exists on the selected inbox",
    })

    expect(mockCreateContactWithoutMac).not.toHaveBeenCalled()
  })

  test("maps a duplicate SMTP identity to the email field", async () => {
    mockFindOrFail.mockResolvedValue({ id: "smtp-inbox-1", channel: "smtp" })
    mockContactInboxFindLatestBySource.mockResolvedValue({ id: "existing-ci" })

    await expect(
      createContactWithInbox({
        workspaceId: "ws-1",
        input: {
          ...baseInput,
          inboxId: "smtp-inbox-1",
          phoneNumber: "",
          channel: "smtp",
          contactId: "",
        },
      }),
    ).rejects.toMatchObject({
      field: "email",
      message: "This contact already exists on the selected inbox",
    })

    expect(mockCreateContactWithoutMac).not.toHaveBeenCalled()
  })

  test("skips the phone dedup when no phone is provided", async () => {
    mockFindOrFail.mockResolvedValue({ id: "smtp-inbox-1", channel: "smtp" })
    mockCreateWithInsertedRows()

    await createContactWithInbox({
      workspaceId: "ws-1",
      input: {
        ...baseInput,
        inboxId: "smtp-inbox-1",
        phoneNumber: "",
        channel: "smtp",
        contactId: "",
      },
    })

    expect(mockFindByPhone).not.toHaveBeenCalled()
  })

  test("emits contact-created and analytics events on success", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "webchat-inbox-1",
      channel: "webchat",
    })
    mockCreateWithInsertedRows()

    await createContactWithInbox({
      workspaceId: "ws-1",
      input: {
        ...baseInput,
        inboxId: "webchat-inbox-1",
        phoneNumber: "",
        channel: "webchat",
        contactId: "",
      },
    })

    expect(mockEmitContactCreated).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      "Ada",
      "+15551234567",
      "ada@example.com",
      "contact-inbox-1",
    )
    expect(mockEmit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        eventType: "contact:created",
        workspaceId: "ws-1",
        channel: "webchat",
      }),
    )
  })
})
