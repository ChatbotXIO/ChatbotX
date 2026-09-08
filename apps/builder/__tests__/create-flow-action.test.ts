// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCreateDraft = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  flowService: {
    createDraft: (...args: unknown[]) => mockCreateDraft(...args),
  },
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

vi.mock("../src/features/flows/schema/action", () => ({
  createFlowSchema: {},
}))

const { createFlowAction: createFlowActionUntyped } = await import(
  "../src/features/flows/actions/create-flow-action"
)
const createFlowAction = createFlowActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createFlowAction", () => {
  test("delegates to flowService.createDraft with the resolved workspaceId", async () => {
    mockCreateDraft.mockResolvedValue({ id: "flow-1" })

    const result = await createFlowAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { name: "New flow", folderId: null },
    } as never)

    expect(mockCreateDraft).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: { name: "New flow", folderId: null },
    })
    expect(result).toEqual({ id: "flow-1" })
  })
})
