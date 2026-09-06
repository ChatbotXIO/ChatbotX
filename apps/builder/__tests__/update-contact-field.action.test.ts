// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockUpdateFieldsAndCustomFields = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: {
    updateFieldsAndCustomFields: (...args: unknown[]) =>
      mockUpdateFieldsAndCustomFields(...args),
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

vi.mock("../src/features/contacts/schema/action", () => ({
  updateContactFieldRequest: {},
}))

const { updateContactFieldAction: updateContactFieldActionUntyped } =
  await import("../src/features/contacts/actions/update-contact-field.action")
const updateContactFieldAction = updateContactFieldActionUntyped as unknown as (
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

describe("updateContactFieldAction", () => {
  test("delegates to contactService.updateFieldsAndCustomFields with the resolved access scope", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    vi.mocked(requireContactPermissionScope).mockResolvedValue(
      accessScope as never,
    )
    mockUpdateFieldsAndCustomFields.mockResolvedValue(undefined)

    await updateContactFieldAction({
      bindArgsParsedInputs: ["ws-1", "contact-1"],
      parsedInput: { firstName: "Grace" },
    } as never)

    expect(mockUpdateFieldsAndCustomFields).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "contact-1", accessScope },
      { firstName: "Grace" },
    )
  })
})
