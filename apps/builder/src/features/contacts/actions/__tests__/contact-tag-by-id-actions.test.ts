// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireLiveTags: vi.fn(),
  attachToContact: vi.fn(),
  detachFromContact: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({ tagService: mocks }))
vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))
vi.mock("../../permissions", () => ({
  requireContactPermissionScope: vi.fn(),
}))
vi.mock("../../schema/contact-tag", () => ({ contactTagByIdRequest: {} }))

const { addContactTagByIdAction: addUntyped } = await import(
  "../add-contact-tag-by-id.action"
)
const { removeContactTagByIdAction: removeUntyped } = await import(
  "../remove-contact-tag-by-id.action"
)
const { requireContactPermissionScope } = await import("../../permissions")
type Action = (props: unknown) => Promise<unknown>
const add = addUntyped as unknown as Action
const remove = removeUntyped as unknown as Action

const scope = { restrictToAssignedUserId: "user-1" }
const input = {
  bindArgsParsedInputs: ["w1"],
  parsedInput: { contactId: "c1", tagId: "t1" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireLiveTags.mockResolvedValue([{ id: "t1", name: "alpha" }])
  mocks.attachToContact.mockResolvedValue(["t1"])
  vi.mocked(requireContactPermissionScope).mockResolvedValue(scope as never)
})

describe("addContactTagByIdAction", () => {
  test("checks the tag is live, then attaches by id with the member's scope", async () => {
    await add(input)

    expect(mocks.requireLiveTags).toHaveBeenCalledWith({
      workspaceId: "w1",
      tagIds: ["t1"],
    })
    expect(mocks.attachToContact).toHaveBeenCalledWith({
      workspaceId: "w1",
      contactId: "c1",
      tagIds: ["t1"],
      accessScope: scope,
    })
  })

  test("reports attached when the link exists", async () => {
    await expect(add(input)).resolves.toMatchObject({
      tagId: "t1",
      tag: { id: "t1" },
      attached: true,
    })
  })

  test("reports not attached when the tag was deleted before the attach", async () => {
    mocks.attachToContact.mockResolvedValue([])

    await expect(add(input)).resolves.toMatchObject({
      tagId: "t1",
      attached: false,
    })
  })

  test("a deleted tag fails and nothing is attached or created", async () => {
    mocks.requireLiveTags.mockRejectedValue(new Error("Tag not found"))

    await expect(add(input)).rejects.toThrow("Tag not found")
    expect(mocks.attachToContact).not.toHaveBeenCalled()
  })

  test("a member without contacts access never reaches the service", async () => {
    vi.mocked(requireContactPermissionScope).mockRejectedValue(
      new Error("User is not authorized to access contacts"),
    )

    await expect(add(input)).rejects.toThrow("not authorized")
    expect(mocks.requireLiveTags).not.toHaveBeenCalled()
  })
})

describe("removeContactTagByIdAction", () => {
  test("detaches by id with the member's scope", async () => {
    await remove(input)

    expect(mocks.detachFromContact).toHaveBeenCalledWith({
      workspaceId: "w1",
      contactId: "c1",
      tagIds: ["t1"],
      accessScope: scope,
    })
  })
})
