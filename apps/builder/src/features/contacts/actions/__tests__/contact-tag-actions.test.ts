// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockAttach = vi.fn()
const mockDetach = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  tagService: {
    attachByNamesToContacts: (...args: unknown[]) => mockAttach(...args),
    detachByNamesFromContacts: (...args: unknown[]) => mockDetach(...args),
  },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("../../permissions", () => ({
  requireContactPermissionScope: vi.fn(async () => ({
    restrictToAssignedUserId: undefined,
  })),
}))

vi.mock("../../schema/contact-tag", () => ({
  addContactTagRequest: {},
  removeContactTagsRequest: {},
}))

const { addContactTagAction: addContactTagActionUntyped } = await import(
  "../add-contact-tag.action"
)
const addContactTagAction = addContactTagActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>
const { removeContactTagAction: removeContactTagActionUntyped } = await import(
  "../remove-contact-tag.action"
)
const removeContactTagAction = removeContactTagActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>
const { requireContactPermissionScope } = await import("../../permissions")

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireContactPermissionScope).mockResolvedValue({
    restrictToAssignedUserId: undefined,
  } as never)
})

describe("addContactTagAction", () => {
  test("delegates to tagService.attachByNamesToContacts with the resolved access scope", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    vi.mocked(requireContactPermissionScope).mockResolvedValue(
      accessScope as never,
    )
    mockAttach.mockResolvedValue(undefined)

    await addContactTagAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["c-1"], tags: ["tag-a"] },
    } as never)

    expect(mockAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["tag-a"],
      accessScope,
    })
  })
})

describe("removeContactTagAction", () => {
  test("delegates to tagService.detachByNamesFromContacts with the resolved access scope", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    vi.mocked(requireContactPermissionScope).mockResolvedValue(
      accessScope as never,
    )
    mockDetach.mockResolvedValue(undefined)

    await removeContactTagAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["c-1"], tags: ["tag-a"] },
    } as never)

    expect(mockDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["tag-a"],
      accessScope,
    })
  })
})
