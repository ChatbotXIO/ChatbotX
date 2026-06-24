import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

const mockFindByPhone = vi.fn()
const mockContactInsert = vi.fn()
const mockCreateNewContactWithMac = vi.fn()
const mockQuotaIncrement = vi.fn()
const mockWorkspaceFind = vi.fn()
const mockFindOrFail = vi.fn()
const mockEmit = vi.fn()
const mockEmitContactCreated = vi.fn()
const mockReturnValidationErrors = vi.fn((_schema, errors) => errors)

vi.mock("@chatbotx.io/business", () => ({
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
    channelTypes: { enum: { webchat: "webchat" } },
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

beforeEach(() => {
  vi.clearAllMocks()
  mockFindByPhone.mockResolvedValue(undefined)
  mockFindOrFail.mockResolvedValue({ id: "inbox-1", channel: "webchat" })
  mockWorkspaceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  mockContactInsert.mockResolvedValue(contact)
  mockQuotaIncrement.mockResolvedValue(undefined)
  mockEmitContactCreated.mockResolvedValue(undefined)
  mockCreateNewContactWithMac.mockImplementation(
    async (args: { create: (tx: unknown) => Promise<{ value: unknown }> }) => {
      const tx = {
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
        phoneNumber: "+15551234567",
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
        phoneNumber: "+15551234567",
      },
    })

    expect(result).toMatchObject({
      phoneNumber: { _errors: ["Contact limit reached"] },
    })
    expect(mockContactInsert).not.toHaveBeenCalled()
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })
})
