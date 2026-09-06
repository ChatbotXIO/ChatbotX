// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockSoftDelete = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  tagService: { softDelete: (...args: unknown[]) => mockSoftDelete(...args) },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
  bulkUpdateIdsRequest: {},
}))

const { deleteTagAction: deleteTagActionUntyped } = await import(
  "../src/features/tags/actions/delete-tag-action"
)
const deleteTagAction = deleteTagActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deleteTagAction", () => {
  test("delegates to tagService.softDelete with the resolved workspaceId and ids", async () => {
    mockSoftDelete.mockResolvedValue(undefined)

    await deleteTagAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["t1", "t2"] },
    } as never)

    expect(mockSoftDelete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["t1", "t2"],
    })
  })
})
