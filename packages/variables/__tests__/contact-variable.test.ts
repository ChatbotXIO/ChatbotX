import { systemFieldTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ContactCustomFieldValue } from "../src/schema"

const {
  mockContactCustomFieldFindMany,
  mockContactFindFirst,
  mockContactInboxFindFirst,
  mockFindLatestLastIncomingMessageAt,
  mockWorkspaceFind,
} = vi.hoisted(() => ({
  mockContactCustomFieldFindMany: vi.fn(),
  mockContactFindFirst: vi.fn(),
  mockContactInboxFindFirst: vi.fn(),
  mockWorkspaceFind: vi.fn(),
  mockFindLatestLastIncomingMessageAt: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    findLatestLastIncomingMessageAtByContactId:
      mockFindLatestLastIncomingMessageAt,
  },
  resolveTenantSettings: vi.fn(),
  workspaceService: {
    find: mockWorkspaceFind,
  },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactModel: {
        findFirst: mockContactFindFirst,
      },
      contactInboxModel: {
        findFirst: mockContactInboxFindFirst,
      },
      contactCustomFieldModel: {
        findMany: mockContactCustomFieldFindMany,
      },
    },
  },
}))

const { contactVariableService } = await import("../src/contact-variable")

beforeEach(() => {
  vi.clearAllMocks()
})

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  firstName: "Ada",
  locale: null,
  timezone: "UTC",
} as ContactModel

const contactInbox = {
  id: "contact-inbox-1",
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
} as ContactInboxModel

const workspace = {
  id: "workspace-1",
  timezone: "UTC",
} as WorkspaceModel

const createCustomFieldsMap = (
  fields: Array<Partial<ContactCustomFieldValue> & { key: string }>,
) =>
  new Map(
    fields.map((field) => [
      field.key,
      {
        description: "",
        type: "text",
        value: "",
        ...field,
      } as ContactCustomFieldValue,
    ]),
  )

const createVariables = (
  fields: Array<Partial<ContactCustomFieldValue> & { key: string }> = [],
) => ({
  contact,
  contactInbox,
  customFieldsMap: createCustomFieldsMap(fields),
  workspace,
})

describe("contactVariableService.replaceAll", () => {
  test("renders null system fields as empty strings", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Locale: {{locale}}.",
        variables: createVariables(),
      }),
    ).resolves.toBe("Locale: .")
  })

  test("substitutes system fields with values", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "First name: {{first_name}}.",
        variables: createVariables(),
      }),
    ).resolves.toBe("First name: Ada.")
  })

  test("renders missing custom field values as empty strings", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Plan: {{plan}}.",
        variables: createVariables([
          {
            key: "plan",
            value: undefined as unknown as string,
          },
        ]),
      }),
    ).resolves.toBe("Plan: .")
  })

  test("keeps unknown placeholders literal", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "{{not_a_field}} {{locale2}} {{status}}",
        variables: createVariables([
          {
            key: "status",
            value: "active",
          },
        ]),
      }),
    ).resolves.toBe("{{not_a_field}}  active")
  })

  test("does not render custom field null values as string null", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Broken: {{broken}}.",
        variables: createVariables([
          {
            key: "broken",
            value: null as unknown as string,
          },
        ]),
      }),
    ).resolves.toBe("Broken: .")
  })

  test("sanity-checks referenced system field names", () => {
    expect(systemFieldTypes.options).toContain("locale")
    expect(systemFieldTypes.options).toContain("first_name")
  })
})

describe("contactVariableService.getAll", () => {
  test("uses a provided contact inbox object and skips the inbox query", async () => {
    mockContactFindFirst.mockResolvedValue(contact)
    mockWorkspaceFind.mockResolvedValue(workspace)
    mockContactCustomFieldFindMany.mockResolvedValue([
      {
        value: "gold",
        customField: {
          name: "plan",
          type: "text",
          description: "Plan",
        },
      },
    ])

    await expect(
      contactVariableService.getAll({
        contactId: "contact-1",
        contactInbox,
      }),
    ).resolves.toMatchObject({
      contact,
      contactInbox,
      workspace,
    })
    expect(mockContactInboxFindFirst).not.toHaveBeenCalled()
  })

  test("loads a contact inbox once when an id is provided", async () => {
    mockContactFindFirst.mockResolvedValue(contact)
    mockContactInboxFindFirst.mockResolvedValue(contactInbox)
    mockWorkspaceFind.mockResolvedValue(workspace)
    mockContactCustomFieldFindMany.mockResolvedValue([])

    await expect(
      contactVariableService.getAll({
        contactId: "contact-1",
        contactInbox: "contact-inbox-1",
      }),
    ).resolves.toMatchObject({
      contactInbox,
    })
    expect(mockContactInboxFindFirst).toHaveBeenCalledWith({
      where: { id: "contact-inbox-1" },
    })
  })

  test("uses the provided workspace and skips the workspace query", async () => {
    mockContactFindFirst.mockResolvedValue(contact)
    mockContactCustomFieldFindMany.mockResolvedValue([])

    await expect(
      contactVariableService.getAll({
        contactId: "contact-1",
        contactInbox,
        workspace,
      }),
    ).resolves.toMatchObject({
      workspace,
    })
    expect(mockWorkspaceFind).not.toHaveBeenCalled()
  })
})
