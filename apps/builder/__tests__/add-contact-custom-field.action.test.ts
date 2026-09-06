// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockApplyOperationToContacts = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: {
    applyOperationToContacts: (...args: unknown[]) =>
      mockApplyOperationToContacts(...args),
  },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("../src/features/contacts/permissions", () => ({
  requireContactPermissionScope: vi.fn(async () => ({
    restrictToAssignedUserId: undefined,
  })),
}))

vi.mock("../src/features/contacts/schema/contact-custom-field", () => ({
  addContactCustomFieldRequest: {},
}))

const { addContactCustomFieldAction: addContactCustomFieldActionUntyped } =
  await import(
    "../src/features/contacts/actions/add-contact-custom-field.action"
  )
const addContactCustomFieldAction =
  addContactCustomFieldActionUntyped as unknown as (
    props: unknown,
  ) => Promise<unknown>
const { requireContactPermissionScope } = await import(
  "../src/features/contacts/permissions"
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireContactPermissionScope).mockResolvedValue({
    restrictToAssignedUserId: undefined,
  } as never)
})

describe("addContactCustomFieldAction", () => {
  test("delegates to contactCustomFieldService.applyOperationToContacts with the resolved access scope", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    vi.mocked(requireContactPermissionScope).mockResolvedValue(
      accessScope as never,
    )
    mockApplyOperationToContacts.mockResolvedValue(undefined)

    await addContactCustomFieldAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        ids: ["contact-1"],
        customFieldId: "cf-1",
        operation: "set",
        value: "pro",
        clientTimezone: "Asia/Ho_Chi_Minh",
      },
    } as never)

    expect(mockApplyOperationToContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: "set",
      value: "pro",
      sourceTimezone: "Asia/Ho_Chi_Minh",
      accessScope,
    })
  })
})
