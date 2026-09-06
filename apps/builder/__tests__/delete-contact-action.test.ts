// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockDeleteAndRecord = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: {
    deleteAndRecord: (...args: unknown[]) => mockDeleteAndRecord(...args),
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

vi.mock("../src/features/contacts/schema/contact-delete", () => ({
  deleteContactRequest: {},
}))

const { deleteContactAction: deleteContactActionUntyped } = await import(
  "../src/features/contacts/actions/delete-contact.action"
)
const deleteContactAction = deleteContactActionUntyped as unknown as (
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

describe("deleteContactAction", () => {
  test("delegates to contactService.deleteAndRecord with the resolved access scope", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    vi.mocked(requireContactPermissionScope).mockResolvedValue(
      accessScope as never,
    )
    mockDeleteAndRecord.mockResolvedValue(undefined)

    await deleteContactAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["contact-1", "contact-2"] },
    } as never)

    expect(mockDeleteAndRecord).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["contact-1", "contact-2"],
      accessScope,
      triggerSource: "api",
    })
  })
})
