// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCreateWithInbox = vi.fn()
const mockReturnValidationErrors = vi.fn((_schema, errors) => errors)

vi.mock("@chatbotx.io/business", () => ({
  contactService: {
    createWithInbox: (...args: unknown[]) => mockCreateWithInbox(...args),
  },
}))

class FakeChatbotXException extends Error {
  code: string
  field?: string
  constructor(message: string, code = "validation", field?: string) {
    super(message)
    this.code = code
    this.field = field
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: FakeChatbotXException,
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("../src/features/contacts/schema/action", () => ({
  createContactRequest: {},
}))

const { createContactAction: createContactActionUntyped } = await import(
  "../src/features/contacts/actions/create-contact.action"
)
const createContactAction = createContactActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createContactAction", () => {
  test("delegates to contactService.createWithInbox with the resolved workspaceId", async () => {
    const created = {
      contact: { id: "contact-1" },
      contactInbox: { id: "ci-1" },
    }
    mockCreateWithInbox.mockResolvedValue(created)

    await createContactAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { email: "ada@example.com", channel: "webchat" },
    } as never)

    expect(mockCreateWithInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      input: { email: "ada@example.com", channel: "webchat" },
    })
  })

  test("maps a field-scoped validation exception to a form field error", async () => {
    mockCreateWithInbox.mockRejectedValue(
      new FakeChatbotXException(
        "Please include the country code (e.g. +84)",
        "validation",
        "phoneNumber",
      ),
    )

    await expect(
      createContactAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { email: "", channel: "whatsapp" },
      } as never),
    ).rejects.toThrow("Please include the country code (e.g. +84)")

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(expect.anything(), {
      _errors: ["Validation Exception"],
      phoneNumber: {
        _errors: ["Please include the country code (e.g. +84)"],
      },
    })
  })

  test("re-throws non-validation errors without mapping", async () => {
    mockCreateWithInbox.mockRejectedValue(new Error("boom"))

    await expect(
      createContactAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { email: "ada@example.com", channel: "webchat" },
      } as never),
    ).rejects.toThrow("boom")

    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })
})
