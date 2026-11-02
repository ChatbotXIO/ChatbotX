import { beforeEach, describe, expect, test, vi } from "vitest"

// The adapter's own semantics, through the real collectors: only the
// repositories and services underneath are mocked.

const mocks = vi.hoisted(() => ({
  listFlowIds: vi.fn(),
  findTags: vi.fn(),
  findCustomFields: vi.fn(),
  findBotFields: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: {
    listIdsByIds: mocks.listFlowIds,
    listCurrentVersionNodesByFlowIds: vi.fn(async () => []),
  },
  pipelineRepository: {
    findById: vi.fn(),
    listFieldsByPipelineIds: vi.fn(async () => []),
  },
  pipelineStageRepository: { listByPipelineIds: vi.fn(async () => []) },
  pipelineReferenceRepository: {
    listWorkspaceMembers: vi.fn(async () => []),
    listInboxTeamIds: vi.fn(async () => []),
  },
}))
vi.mock("../src/tag/service", () => ({
  tagService: { findManyByIds: mocks.findTags },
}))
vi.mock("../src/bot-field/service", () => ({
  botFieldService: { findManyByIds: mocks.findBotFields },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: {
    findManyByIds: mocks.findCustomFields,
    findManyByKeys: vi.fn(async () => new Map()),
  },
}))

const { actionReferencesExistInWorkspace } = await import(
  "../src/inbound-webhook/action-references"
)

const check = (actions: Record<string, unknown>[]) =>
  actionReferencesExistInWorkspace({
    workspaceId: "ws-1",
    actions: actions as never,
  })

const echo = ({ ids }: { ids: string[] }) =>
  Promise.resolve(ids.map((id) => ({ id })))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listFlowIds.mockImplementation(
    async ({ ids }: { ids: string[] }) => ids,
  )
  mocks.findTags.mockImplementation(echo)
  mocks.findCustomFields.mockImplementation(echo)
  mocks.findBotFields.mockImplementation(echo)
})

describe("actionReferencesExistInWorkspace (inbound webhook semantics)", () => {
  test("accepts ids that exist and actions without references", async () => {
    await expect(
      check([
        { type: "startAnotherFlow", flowId: "10" },
        { type: "addTag", tagIds: ["1"] },
        { type: "setCustomField", customFieldId: "5" },
        { type: "clearCustomField", customFieldId: "bot_field:6" },
        { type: "transferConversationToHuman" },
      ]),
    ).resolves.toBe(true)
  })

  test("a flow that was never published is still an existing flow", async () => {
    await expect(
      check([{ type: "startAnotherFlow", flowId: "11" }]),
    ).resolves.toBe(true)
  })

  test.each([
    ["a malformed flow id", { type: "startAnotherFlow", flowId: "abc" }],
    ["an empty flow id", { type: "startAnotherFlow", flowId: "" }],
    ["an empty tag id", { type: "addTag", tagIds: [""] }],
    ["a malformed tag id", { type: "removeTag", tagIds: ["x"] }],
    [
      "a field referenced by name (a webhook writes by id only)",
      { type: "setCustomField", customFieldId: "Plan" },
    ],
  ])("rejects %s", async (_label, action) => {
    await expect(check([action])).resolves.toBe(false)
  })

  test("rejects a flow of another workspace", async () => {
    mocks.listFlowIds.mockResolvedValue([])

    await expect(
      check([{ type: "startAnotherFlow", flowId: "10" }]),
    ).resolves.toBe(false)
  })
})
