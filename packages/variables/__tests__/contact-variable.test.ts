import { systemFieldTypes } from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import { describe, expect, test, vi } from "vitest"
import type { ContactCustomFieldValue } from "../src/schema"

const { mockFindLatestContactLastReadAt, mockFindLatestLastIncomingMessageAt } =
  vi.hoisted(() => ({
    mockFindLatestContactLastReadAt: vi.fn(),
    mockFindLatestLastIncomingMessageAt: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    findLatestContactLastReadAtByContactId: mockFindLatestContactLastReadAt,
    findLatestLastIncomingMessageAtByContactId:
      mockFindLatestLastIncomingMessageAt,
  },
  resolveTenantSettings: vi.fn(),
  workspaceService: {
    find: vi.fn(),
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
        findFirst: vi.fn(),
      },
      contactCustomFieldModel: {
        findMany: vi.fn(),
      },
    },
  },
}))

const { contactVariableService } = await import("../src/contact-variable")

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  firstName: "Ada",
  locale: null,
  timezone: "UTC",
} as ContactModel

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

describe("contactVariableService.replaceAll", () => {
  test("renders null system fields as empty strings", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Locale: {{locale}}.",
        variables: {
          contact,
          customFieldsMap: createCustomFieldsMap([]),
        },
      }),
    ).resolves.toBe("Locale: .")
  })

  test("substitutes system fields with values", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "First name: {{first_name}}.",
        variables: {
          contact,
          customFieldsMap: createCustomFieldsMap([]),
        },
      }),
    ).resolves.toBe("First name: Ada.")
  })

  test("renders missing custom field values as empty strings", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Plan: {{plan}}.",
        variables: {
          contact,
          customFieldsMap: createCustomFieldsMap([
            {
              key: "plan",
              value: undefined as unknown as string,
            },
          ]),
        },
      }),
    ).resolves.toBe("Plan: .")
  })

  test("keeps unknown placeholders literal", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "{{not_a_field}} {{locale2}} {{status}}",
        variables: {
          contact,
          customFieldsMap: createCustomFieldsMap([
            {
              key: "status",
              value: "active",
            },
          ]),
        },
      }),
    ).resolves.toBe("{{not_a_field}}  active")
  })

  test("does not render custom field null values as string null", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Broken: {{broken}}.",
        variables: {
          contact,
          customFieldsMap: createCustomFieldsMap([
            {
              key: "broken",
              value: null as unknown as string,
            },
          ]),
        },
      }),
    ).resolves.toBe("Broken: .")
  })

  test("sanity-checks referenced system field names", () => {
    expect(systemFieldTypes.options).toContain("locale")
    expect(systemFieldTypes.options).toContain("first_name")
  })
})
