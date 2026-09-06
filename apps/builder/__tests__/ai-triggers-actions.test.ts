import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// AI Triggers create/duplicate/list actions — thin wrappers delegating to
// aiTriggerService. `list` still gates on assertCurrentUserCanAccessChatbot
// before calling the service.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
  create: vi.fn(),
  duplicate: vi.fn(),
  list: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/features/ai-triggers/schema/action", () => ({
  createAITriggerRequest: {},
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

vi.mock("@chatbotx.io/utils", () => ({
  zodBigintAsString: () => "mocked-schema",
}))

vi.mock("@chatbotx.io/business", () => ({
  aiTriggerService: {
    create: mocks.create,
    duplicate: mocks.duplicate,
    list: mocks.list,
  },
}))

const { createAITriggerAction } = await import(
  "@/features/ai-triggers/actions/create.action"
)
const { duplicateAITriggerAction } = await import(
  "@/features/ai-triggers/actions/duplicate.action"
)
const { listAITriggers } = await import(
  "@/features/ai-triggers/actions/list.action"
)

type ActionHandler<TParsedInput, TBindArgs extends unknown[]> = (props: {
  parsedInput: TParsedInput
  bindArgsParsedInputs: TBindArgs
}) => Promise<unknown>

const workspaceId = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createAITriggerAction", () => {
  test("delegates to aiTriggerService.create with workspaceId + parsedInput", async () => {
    const parsedInput = {
      name: "New trigger",
      description: null,
      questions: [],
      flowId: null,
      finalMessage: null,
    }

    await (
      createAITriggerAction as unknown as ActionHandler<
        typeof parsedInput,
        [string]
      >
    )({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    })

    expect(mocks.create).toHaveBeenCalledWith(workspaceId, parsedInput)
  })
})

describe("duplicateAITriggerAction", () => {
  test("delegates to aiTriggerService.duplicate with workspaceId + id", async () => {
    await (
      duplicateAITriggerAction as unknown as ActionHandler<
        undefined,
        [string, string]
      >
    )({
      parsedInput: undefined,
      bindArgsParsedInputs: [workspaceId, "trigger-1"],
    })

    expect(mocks.duplicate).toHaveBeenCalledWith({
      workspaceId,
      id: "trigger-1",
    })
  })
})

describe("listAITriggers", () => {
  test("asserts chatbot access then delegates to aiTriggerService.list", async () => {
    const input = {
      workspaceId,
      page: 1,
      perPage: 20,
      sort: [],
      name: "",
    }
    mocks.list.mockResolvedValue({ data: [], pageCount: 0 })

    const result = await listAITriggers(input)

    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith(
      workspaceId,
    )
    expect(mocks.list).toHaveBeenCalledWith(input)
    expect(result).toEqual({ data: [], pageCount: 0 })
  })
})
