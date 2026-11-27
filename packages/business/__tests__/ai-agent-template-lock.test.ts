import type { AIAgentModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

const {
  mockUpdate,
  mockFindFirst,
  mockTxFindFirst,
  mockLockOptions,
  mockAssertEditable,
  mockTransactionClient,
  mockFindActiveFlow,
  mockFindTags,
  mockFindCustomFields,
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn()
  const mockTxFindFirst = vi.fn()
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  return {
    mockUpdate: vi.fn(() => ({ set: mockUpdateSet })),
    mockFindFirst: vi.fn(),
    mockTxFindFirst,
    mockLockOptions: vi.fn(),
    mockAssertEditable: vi.fn(),
    mockTransactionClient: {
      marker: "locked-tx",
      query: { aiAgentModel: { findFirst: mockTxFindFirst } },
    },
    mockFindActiveFlow: vi.fn(),
    mockFindTags: vi.fn(async () => [{ id: "tag-1" }]),
    mockFindCustomFields: vi.fn(async () => [{ id: "cf-1" }]),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {
    query: { aiAgentModel: { findFirst: mockFindFirst, findMany: vi.fn() } },
    update: mockUpdate,
  },
  eq: vi.fn(),
  inArray: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  aiAgentModel: { id: "id", workspaceId: "workspaceId" },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(async (_k: string, cb: () => unknown) => cb()),
}))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findManyByIds: mockFindCustomFields },
}))
vi.mock("../src/enterprise/inbox-team/service", () => ({
  inboxTeamService: { listExistingIds: vi.fn(async () => []) },
}))
vi.mock("../src/flow/service", () => ({
  flowService: { findActiveById: mockFindActiveFlow },
}))
vi.mock("../src/tag/service", () => ({
  tagService: { findManyByIds: mockFindTags },
}))
vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { findByWorkspaceIdAndUserId: vi.fn() },
}))
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    assertDeletable: vi.fn(),
    assertResourceEditable: mockAssertEditable,
  }),

  changedKeysOf: vi.fn((_e: unknown, patch: Record<string, unknown>) =>
    Object.keys(patch),
  ),
}))
// Run the locked transaction against a sentinel client the test can recognise.
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: (
    run: (tx: unknown) => unknown,
    options?: unknown,
  ) => {
    mockLockOptions(options)
    return run(mockTransactionClient)
  },
}))

const { aiAgentService } = await import("../src/ai-agent/service")

const workspaceId = "workspace-1"
const aiAgent = { id: "agent-1", workspaceId, isDefault: false } as AIAgentModel

const txUpdate = vi.fn(() => ({
  set: () => ({ where: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockFindFirst.mockResolvedValue(aiAgent)
  mockTxFindFirst.mockResolvedValue(aiAgent)
  mockFindActiveFlow.mockResolvedValue({ currentVersionId: "v1" })
  Object.assign(mockTransactionClient, { update: txUpdate })
})

describe("aiAgentService.updateAIAgent template lock", () => {
  test("runs the guard first on the locked transaction, before any write", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      { name: "Renamed" },
    )

    expect(mockAssertEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "aiAgent",
        resourceIds: ["agent-1"],
        changedKeys: ["name"],
        referencedParents: [],
        tx: mockTransactionClient,
      }),
    )
    expect(mockAssertEditable.mock.invocationCallOrder[0]).toBeLessThan(
      txUpdate.mock.invocationCallOrder[0] as number,
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test("locks the agent first, then reads the stored row on the locked transaction", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      { name: "Renamed" },
    )

    // Narrowed to installed resources by the workspace (no lock otherwise).
    expect(mockLockOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        initialKeys: [{ kind: "aiAgent", resourceId: "agent-1" }],
        workspaceId: expect.any(String),
      }),
    )
    expect(mockLockOptions.mock.invocationCallOrder[0]).toBeLessThan(
      mockTxFindFirst.mock.invocationCallOrder[0] as number,
    )
    expect(mockTxFindFirst.mock.invocationCallOrder[0]).toBeLessThan(
      mockAssertEditable.mock.invocationCallOrder[0] as number,
    )
  })

  test("locks the flow, tag and custom field the action rules reference", async () => {
    await aiAgentService.updateAIAgent({ id: "agent-1", workspaceId }, {
      actionRules: [
        {
          id: "rule-1",
          when: "Customer asks",
          actions: [
            { id: "a1", type: "send_flow", flowId: "flow-1" },
            { id: "a2", type: "add_tag", tagId: "tag-1" },
            {
              id: "a3",
              type: "clear_custom_field",
              customFieldId: "cf-1",
            },
          ],
        },
      ],
    } as never)

    const input = mockAssertEditable.mock.calls[0]?.[0] as {
      referencedParents: { kind: string; resourceId: string }[]
    }
    expect(input.referencedParents).toEqual([
      { kind: "flow", resourceId: "flow-1" },
      { kind: "tag", resourceId: "tag-1" },
      { kind: "customField", resourceId: "cf-1" },
    ])
  })

  test("locks the file, function and MCP server the tools reference with the action-rule parents", async () => {
    await aiAgentService.updateAIAgent({ id: "agent-1", workspaceId }, {
      tools: ["file:11", "fn:22", "mcp:33", "web_search"],
    } as never)

    const input = mockAssertEditable.mock.calls[0]?.[0] as {
      referencedParents: { kind: string; resourceId: string }[]
    }
    expect(input.referencedParents).toEqual([
      { kind: "aiFile", resourceId: "11" },
      { kind: "aiFunction", resourceId: "22" },
      { kind: "aiMcpServer", resourceId: "33" },
    ])
    expect(mockLockOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        initialKeys: expect.arrayContaining([
          { kind: "aiAgent", resourceId: "agent-1" },
          { kind: "aiFile", resourceId: "11" },
        ]),
      }),
    )
  })

  test("a blocked edit never writes", async () => {
    mockAssertEditable.mockRejectedValueOnce(new Error("locked"))

    await expect(
      aiAgentService.updateAIAgent(
        { id: "agent-1", workspaceId },
        { name: "Renamed" },
      ),
    ).rejects.toThrow("locked")
    expect(txUpdate).not.toHaveBeenCalled()
  })
})
