import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

const mockFindByPhone = vi.fn()
const mockContactInboxFindLatestBySource = vi.fn()
const mockContactInsert = vi.fn()
const mockCreateNewContactWithMac = vi.fn()
const mockQuotaIncrement = vi.fn()
const mockWorkspaceFind = vi.fn()
const mockFindOrFail = vi.fn()
const mockEmit = vi.fn()
const mockEmitContactCreated = vi.fn()
const mockReturnValidationErrors = vi.fn((_schema, errors) => errors)

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    findLatestBySource: mockContactInboxFindLatestBySource,
  },
  contactService: {
    findByPhone: mockFindByPhone,
    insert: mockContactInsert,
  },
  quotaEnforcementService: {
    createNewContactWithMac: mockCreateNewContactWithMac,
    increment: mockQuotaIncrement,
  },
  workspaceService: {
    find: mockWorkspaceFind,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/partials", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/database/partials")
  >("@chatbotx.io/database/partials")
  return {
    ...actual,
    contactSources: { enum: { imported: "imported" } },
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {},
  conversationModel: {},
  inboxModel: {},
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: mockEmitContactCreated,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "generated-id",
  zodBigintAsString: () => z.string(),
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("remeda", () => ({
  randomString: () => "random",
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({
        action: vi.fn(),
      }),
    }),
  },
}))

const { createContact } = await import(
  "../src/features/contacts/actions/create-contact.action"
)
const { createContactRequest } = await import(
  "../src/features/contacts/schemas/action"
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
  source: "imported",
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
  create: (tx: CreateContactTestTx) => Promise<{ value: unknown }>
}

const mockCreateWithInsertedRows = () => {
  const insertedRows: InsertedContactInboxRow[] = []
  mockCreateNewContactWithMac.mockImplementation(
    async (args: CreateContactQuotaArgs) => {
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
      const created = await args.create(tx)
      return { ok: true, value: created.value }
    },
  )
  return insertedRows
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindByPhone.mockResolvedValue(undefined)
  mockContactInboxFindLatestBySource.mockResolvedValue(undefined)
  mockFindOrFail.mockResolvedValue({ id: "inbox-1", channel: "webchat" })
  mockWorkspaceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  mockContactInsert.mockResolvedValue(contact)
  mockQuotaIncrement.mockResolvedValue(undefined)
  mockEmitContactCreated.mockResolvedValue(undefined)
  mockCreateNewContactWithMac.mockImplementation(
    async (args: CreateContactQuotaArgs) => {
      const tx: CreateContactTestTx = {
        insert: () => ({
          values: () => ({
            returning: () => [contactInbox],
          }),
        }),
      }
      const created = await args.create(tx)
      return { ok: true, value: created.value }
    },
  )
})

describe("createContact", () => {
  test("creates manual contacts through the atomic MAC reservation helper", async () => {
    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "ada@example.com",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "inbox-1",
        phoneNumber: "+15551234567",
        channel: "webchat",
        contactId: "",
      },
    })

    expect(result).toEqual(contact)
    expect(mockCreateNewContactWithMac).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        workspaceId: "ws-1",
      }),
    )
    // The info-only `contacts` counter is now recorded inside the atomic
    // chokepoint (createNewContactWithMac), not by the action, so the action
    // must not separately increment it (that would double-count).
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("does not increment contacts when MAC reservation is rejected", async () => {
    mockCreateNewContactWithMac.mockResolvedValue({ ok: false, level: "user" })

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "ada@example.com",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "inbox-1",
        phoneNumber: "+15551234567",
        channel: "webchat",
        contactId: "",
      },
    })

    expect(result).toMatchObject({
      phoneNumber: { _errors: ["Contact limit reached"] },
    })
    expect(mockContactInsert).not.toHaveBeenCalled()
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("attaches manual contacts to the selected workspace inbox", async () => {
    const selectedInbox = { id: "messenger-inbox-1", channel: "messenger" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    const insertedRows = mockCreateWithInsertedRows()

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "ada@example.com",
        firstName: "Ada",
        gender: "unknown",
        inboxId: selectedInbox.id,
        phoneNumber: "+15551234567",
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
        sourceId: "psid-123",
      }),
    )
  })

  test("uses WhatsApp phone digits as the source id", async () => {
    const selectedInbox = { id: "whatsapp-inbox-1", channel: "whatsapp" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    const insertedRows = mockCreateWithInsertedRows()

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: selectedInbox.id,
        phoneNumber: "+15551234567",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(mockContactInboxFindLatestBySource).toHaveBeenCalledWith({
      inboxId: selectedInbox.id,
      sourceId: "15551234567",
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

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
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

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: selectedInbox.id,
        phoneNumber: "0901234567",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(result).toMatchObject({
      phoneNumber: {
        _errors: ["Please include the country code (e.g. +84)"],
      },
    })
    expect(mockContactInsert).not.toHaveBeenCalled()
    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
  })

  test("uses email as the source id for SMTP contacts", async () => {
    const selectedInbox = { id: "smtp-inbox-1", channel: "smtp" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    const insertedRows = mockCreateWithInsertedRows()

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "ada@example.com",
        firstName: "Ada",
        gender: "unknown",
        inboxId: selectedInbox.id,
        phoneNumber: "",
        channel: "smtp",
        contactId: "",
      },
    })

    expect(mockContactInboxFindLatestBySource).toHaveBeenCalledWith({
      inboxId: selectedInbox.id,
      sourceId: "ada@example.com",
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

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
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

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: selectedInbox.id,
        phoneNumber: "+15551234567",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(result).toMatchObject({
      inboxId: {
        _errors: ["Selected inbox does not match the selected source"],
      },
    })
    expect(mockContactInboxFindLatestBySource).not.toHaveBeenCalled()
    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
  })

  test("returns a field validation error when the selected inbox identity already exists", async () => {
    const selectedInbox = { id: "messenger-inbox-1", channel: "messenger" }
    mockFindOrFail.mockResolvedValue(selectedInbox)
    mockContactInboxFindLatestBySource.mockResolvedValue({
      id: "existing-contact-inbox-1",
    })

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: selectedInbox.id,
        phoneNumber: "",
        channel: "messenger",
        contactId: "psid-123",
      },
    })

    expect(result).toMatchObject({
      contactId: {
        _errors: ["This contact already exists on the selected inbox"],
      },
    })
    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
  })

  test("uses an already-international WhatsApp number even when a target country is set", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "whatsapp-inbox-1",
      channel: "whatsapp",
    })
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      targetCountry: "VN",
    })
    const insertedRows = mockCreateWithInsertedRows()

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "whatsapp-inbox-1",
        phoneNumber: "+84901234567",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(insertedRows).toContainEqual(
      expect.objectContaining({ sourceId: "84901234567" }),
    )
  })

  test("prefers an explicit country code over the workspace target country", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "whatsapp-inbox-1",
      channel: "whatsapp",
    })
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      targetCountry: "VN",
    })
    const insertedRows = mockCreateWithInsertedRows()

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "whatsapp-inbox-1",
        phoneNumber: "+12015550123",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(mockContactInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phoneNumber: "+12015550123" }),
      }),
    )
    expect(insertedRows).toContainEqual(
      expect.objectContaining({ sourceId: "12015550123" }),
    )
  })

  test("strips spaces and separators from local WhatsApp numbers", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "whatsapp-inbox-1",
      channel: "whatsapp",
    })
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      targetCountry: "VN",
    })
    const insertedRows = mockCreateWithInsertedRows()

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "whatsapp-inbox-1",
        phoneNumber: "090 123 4567",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(insertedRows).toContainEqual(
      expect.objectContaining({ sourceId: "84901234567" }),
    )
  })

  test("requires a country code when the WhatsApp phone is empty", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "whatsapp-inbox-1",
      channel: "whatsapp",
    })
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      targetCountry: "VN",
    })

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "whatsapp-inbox-1",
        phoneNumber: "",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(result).toMatchObject({
      phoneNumber: { _errors: ["Please include the country code (e.g. +84)"] },
    })
    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
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

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "whatsapp-inbox-1",
        phoneNumber: "0901234567",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(mockFindByPhone).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      phoneNumber: "+84901234567",
    })
    expect(result).toMatchObject({
      phoneNumber: { _errors: ["Phone number is exists"] },
    })
    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
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

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "whatsapp-inbox-1",
        phoneNumber: "0901234567",
        channel: "whatsapp",
        contactId: "",
      },
    })

    expect(mockContactInboxFindLatestBySource).toHaveBeenCalledWith({
      inboxId: "whatsapp-inbox-1",
      sourceId: "84901234567",
    })
    expect(result).toMatchObject({
      phoneNumber: {
        _errors: ["This contact already exists on the selected inbox"],
      },
    })
    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
  })

  test("maps a duplicate SMTP identity to the email field", async () => {
    mockFindOrFail.mockResolvedValue({ id: "smtp-inbox-1", channel: "smtp" })
    mockContactInboxFindLatestBySource.mockResolvedValue({ id: "existing-ci" })

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "ada@example.com",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "smtp-inbox-1",
        phoneNumber: "",
        channel: "smtp",
        contactId: "",
      },
    })

    expect(result).toMatchObject({
      email: {
        _errors: ["This contact already exists on the selected inbox"],
      },
    })
    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
  })

  test("normalizes the phone for non-WhatsApp channels too", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "messenger-inbox-1",
      channel: "messenger",
    })
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      targetCountry: "VN",
    })
    const insertedRows = mockCreateWithInsertedRows()

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "messenger-inbox-1",
        phoneNumber: "0901234567",
        channel: "messenger",
        contactId: "psid-9",
      },
    })

    // Phone is normalized to E.164 even though the identity (sourceId) is the PSID.
    expect(mockContactInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phoneNumber: "+84901234567" }),
      }),
    )
    expect(insertedRows).toContainEqual(
      expect.objectContaining({ sourceId: "psid-9" }),
    )
  })

  test("requires a country code for a non-WhatsApp phone that cannot be resolved", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "messenger-inbox-1",
      channel: "messenger",
    })
    // beforeEach workspace has no targetCountry → a local number cannot be resolved.

    const result = await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "",
        firstName: "Ada",
        gender: "unknown",
        inboxId: "messenger-inbox-1",
        phoneNumber: "0901234567",
        channel: "messenger",
        contactId: "psid-9",
      },
    })

    expect(result).toMatchObject({
      phoneNumber: { _errors: ["Please include the country code (e.g. +84)"] },
    })
    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
  })

  test("skips the phone dedup when no phone is provided", async () => {
    mockFindOrFail.mockResolvedValue({ id: "smtp-inbox-1", channel: "smtp" })
    mockCreateWithInsertedRows()

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "ada@example.com",
        firstName: "Ada",
        gender: "unknown",
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

    await createContact({
      workspaceId: "ws-1",
      parsedInput: {
        email: "ada@example.com",
        firstName: "Ada",
        gender: "unknown",
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

describe("createContactRequest", () => {
  const baseInput = {
    email: "",
    firstName: "Ada",
    gender: "unknown",
    inboxId: "1",
    phoneNumber: "",
    contactId: "",
  } as const

  test("requires phone number for WhatsApp", () => {
    const result = createContactRequest.safeParse({
      ...baseInput,
      channel: "whatsapp",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["phoneNumber"],
        message: "Phone number is required for WhatsApp",
      }),
    )
  })

  test("requires email for SMTP", () => {
    const result = createContactRequest.safeParse({
      ...baseInput,
      channel: "smtp",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["email"],
        message: "Email is required for the Email channel",
      }),
    )
  })

  test("requires contact id for social channels", () => {
    const result = createContactRequest.safeParse({
      ...baseInput,
      channel: "messenger",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["contactId"],
        message: "User ID is required for this channel",
      }),
    )
  })

  test("allows webchat without a channel identity", () => {
    const result = createContactRequest.safeParse({
      ...baseInput,
      channel: "webchat",
    })

    expect(result.success).toBe(true)
  })

  test("accepts WhatsApp with a phone number", () => {
    expect(
      createContactRequest.safeParse({
        ...baseInput,
        channel: "whatsapp",
        phoneNumber: "+84901234567",
      }).success,
    ).toBe(true)
  })

  test("accepts SMTP with an email", () => {
    expect(
      createContactRequest.safeParse({
        ...baseInput,
        channel: "smtp",
        email: "ada@example.com",
      }).success,
    ).toBe(true)
  })

  test("accepts a social channel with a contact id", () => {
    expect(
      createContactRequest.safeParse({
        ...baseInput,
        channel: "messenger",
        contactId: "psid-1",
      }).success,
    ).toBe(true)
  })

  test("rejects an invalid email format", () => {
    const result = createContactRequest.safeParse({
      ...baseInput,
      channel: "webchat",
      email: "not-an-email",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: ["email"] }),
    )
  })

  test("rejects a contact id longer than 255 chars", () => {
    const result = createContactRequest.safeParse({
      ...baseInput,
      channel: "messenger",
      contactId: "x".repeat(256),
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: ["contactId"] }),
    )
  })

  test("rejects a too-short WhatsApp phone number", () => {
    const result = createContactRequest.safeParse({
      ...baseInput,
      channel: "whatsapp",
      phoneNumber: "123",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: ["phoneNumber"] }),
    )
  })
})
