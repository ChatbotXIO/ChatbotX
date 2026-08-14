import { systemFieldTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ContactCustomFieldValue } from "../src/schema"
import { extractVariables } from "../src/utils"

const {
  mockContactCustomFieldFindMany,
  mockContactFindFirst,
  mockContactInboxFindFirst,
  mockFindLatestLastIncomingMessageAt,
  mockListIncomingTextsByContactInbox,
  mockResolveCouponVariable,
  mockWorkspaceFind,
} = vi.hoisted(() => ({
  mockContactCustomFieldFindMany: vi.fn(),
  mockContactFindFirst: vi.fn(),
  mockContactInboxFindFirst: vi.fn(),
  mockWorkspaceFind: vi.fn(),
  mockFindLatestLastIncomingMessageAt: vi.fn(),
  mockListIncomingTextsByContactInbox: vi.fn().mockResolvedValue([]),
  mockResolveCouponVariable: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: { findBy: vi.fn() },
  contactInboxService: {
    findLatestLastIncomingMessageAtByContactId:
      mockFindLatestLastIncomingMessageAt,
  },
  messageService: {
    listIncomingTextsByContactInbox: mockListIncomingTextsByContactInbox,
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

vi.mock("@chatbotx.io/business/coupon", () => ({
  couponService: {
    resolveCouponVariable: mockResolveCouponVariable,
  },
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

  test("supports dotted system variables and keeps unknown dotted placeholders literal", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "{{ai.queued.messages}} {{foo.bar}}",
        variables: createVariables(),
      }),
    ).resolves.toBe(" {{foo.bar}}")
  })

  test("substitutes coupon topic variables with issued coupon code", async () => {
    mockResolveCouponVariable.mockResolvedValue("HHFgpe")

    await expect(
      contactVariableService.replaceAll({
        text: "Mã giảm giá của bạn là {{coupon:11619011544072192}}",
        variables: createVariables(),
      }),
    ).resolves.toBe("Mã giảm giá của bạn là HHFgpe")

    expect(mockResolveCouponVariable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      topicId: "11619011544072192",
    })
  })

  test("extracts and resolves raw custom field variables verbatim", async () => {
    expect(extractVariables("{{raw:Full Name}} {{raw:Ngày sinh}}")).toEqual([
      "raw:Full Name",
      "raw:Ngày sinh",
    ])

    await expect(
      contactVariableService.replaceAll({
        text: "{{raw:Full Name}} {{raw:Ngày sinh}}",
        variables: createVariables([
          {
            key: "Full Name",
            value: "Ada Lovelace",
          },
          {
            key: "Ngày sinh",
            type: "date",
            value: "2026-07-23T00:00:00.000Z",
          },
        ]),
      }),
    ).resolves.toBe("Ada Lovelace 2026-07-23T00:00:00.000Z")
  })

  test("keeps unknown raw variables literal and preserves a real raw-prefixed field name", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "{{raw:Missing}} {{raw:X}}",
        variables: createVariables([
          {
            key: "raw:X",
            value: "field named raw colon x",
          },
        ]),
      }),
    ).resolves.toBe("{{raw:Missing}} field named raw colon x")
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

describe("contactVariableService.replaceAll gender casing", () => {
  const genderVariables = (gender: string | null, language: string) => ({
    ...createVariables(),
    contact: { ...contact, gender } as ContactModel,
    workspace: { ...workspace, language } as WorkspaceModel,
  })

  test("capitalises {{gender}} when it opens the text", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "{{gender}} vui lòng xác nhận đơn hàng.",
        variables: genderVariables("male", "vi"),
      }),
    ).resolves.toBe("Anh vui lòng xác nhận đơn hàng.")
  })

  test("lowercases {{gender}} inside a sentence", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Xin chào {{gender}}, đơn hàng đã được giao.",
        variables: genderVariables("female", "vi"),
      }),
    ).resolves.toBe("Xin chào chị, đơn hàng đã được giao.")
  })

  test("capitalises {{gender}} after a sentence break and after a newline", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Cảm ơn. {{gender}} nhé!\n{{gender}} cần hỗ trợ gì thêm không?",
        variables: genderVariables(null, "vi"),
      }),
    ).resolves.toBe("Cảm ơn. Anh/Chị nhé!\nAnh/Chị cần hỗ trợ gì thêm không?")
  })

  test("keeps the Vietnamese labels for a region-tagged workspace language", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Kính gửi {{gender}}",
        variables: genderVariables("female", "vi-VN"),
      }),
    ).resolves.toBe("Kính gửi chị")
  })

  test("falls back to the English labels for other workspace languages", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "{{gender}} — hello {{gender}}",
        variables: genderVariables("male", "de"),
      }),
    ).resolves.toBe("Male — hello male")
  })

  test("leaves other variables untouched by the sentence casing", async () => {
    await expect(
      contactVariableService.replaceAll({
        text: "Hi {{first_name}}, {{gender}}!",
        variables: genderVariables("male", "vi"),
      }),
    ).resolves.toBe("Hi Ada, anh!")
  })
})

describe("contactVariableService.replaceAll gender language", () => {
  const render = (input: {
    workspaceLanguage: string
    contactLocale?: string | null
    inboxLanguage?: string | null
  }) =>
    contactVariableService.replaceAll({
      text: "{{gender}}",
      variables: {
        ...createVariables(),
        contact: {
          ...contact,
          gender: "female",
          locale: input.contactLocale ?? null,
        } as ContactModel,
        contactInbox: {
          ...contactInbox,
          language: input.inboxLanguage ?? null,
        } as ContactInboxModel,
        workspace: {
          ...workspace,
          language: input.workspaceLanguage,
        } as WorkspaceModel,
      },
    })

  test("prefers the contact channel language over the workspace language", async () => {
    await expect(
      render({ inboxLanguage: "vi", workspaceLanguage: "en" }),
    ).resolves.toBe("Chị")
  })

  test("falls back to the language read from the contact locale", async () => {
    await expect(
      render({ contactLocale: "vi_VN", workspaceLanguage: "en" }),
    ).resolves.toBe("Chị")
  })

  test("prefers the channel language over the contact locale", async () => {
    await expect(
      render({
        contactLocale: "vi_VN",
        inboxLanguage: "en",
        workspaceLanguage: "vi",
      }),
    ).resolves.toBe("Female")
  })

  test("falls back to the workspace language when the contact has none", async () => {
    await expect(render({ workspaceLanguage: "vi" })).resolves.toBe("Chị")
  })

  test("treats a blank contact language as unknown so the workspace wins", async () => {
    await expect(
      render({
        contactLocale: "",
        inboxLanguage: "",
        workspaceLanguage: "vi",
      }),
    ).resolves.toBe("Chị")
  })

  test("keeps the contact language even when it differs from the workspace", async () => {
    await expect(
      render({ contactLocale: "en_US", workspaceLanguage: "vi" }),
    ).resolves.toBe("Female")
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
