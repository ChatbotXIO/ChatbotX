import type {
  ContactInboxModel,
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import type { ConditionStepSchema, EdgeSchema } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ExecuteStepProps } from "../src/integration/handlers/flow-utils"

const {
  integrationQueueAdd,
  matchesContactFilter,
  resolveContactVariablesDeep,
} = vi.hoisted(() => ({
  integrationQueueAdd: vi.fn(async () => undefined),
  matchesContactFilter: vi.fn(),
  resolveContactVariablesDeep: vi.fn(async (_contactId, cases) => cases),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactService: { matchesContactFilter },
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))

vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: integrationQueueAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn() },
}))

const { handleCondition } = await import(
  "../src/integration/handlers/condition"
)

const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  contactId: "contact-1",
} as ConversationModel

const contactInbox = {
  id: "contact-inbox-1",
  contactId: "contact-1",
} as ContactInboxModel

const makeFlowVersion = (edges: EdgeSchema[]): FlowVersionModel =>
  ({
    id: "flow-version-1",
    flowId: "flow-1",
    edges,
  }) as FlowVersionModel

const makeStep = (): ConditionStepSchema => ({
  id: "condition-step-1",
  stepType: "condition",
  otherwiseId: "otherwise-handle",
  cases: [
    {
      id: "empty-case",
      operator: "and",
      conditions: [],
    },
    {
      id: "first-case",
      operator: "and",
      conditions: [
        { field: "lastUserInputType", operator: "eq", value: "text" },
      ],
    },
    {
      id: "second-case",
      operator: "or",
      conditions: [
        { field: "lastUserInput", operator: "contains", value: "x" },
      ],
    },
  ],
})

const makeProps = (
  step: ConditionStepSchema,
  edges: EdgeSchema[],
): ExecuteStepProps<ConditionStepSchema> => ({
  conversation,
  contactInbox,
  flowVersion: makeFlowVersion(edges),
  step,
  useLatestFlowVersion: false,
  trackingContext: { source: "flow" } as never,
  metadata: { source: "condition-test" },
  sendFrom: "inbox",
  nodeVisits: { visitedNodeIds: ["condition-node"] } as never,
})

describe("handleCondition", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveContactVariablesDeep.mockImplementation(
      async (_contactId, cases) => cases,
    )
  })

  test("skips empty cases and routes to the first matching case", async () => {
    matchesContactFilter
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    await handleCondition(
      makeProps(makeStep(), [
        { sourceHandle: "first-case", target: "first-target" },
        { sourceHandle: "second-case", target: "second-target" },
        { sourceHandle: "otherwise-handle", target: "otherwise-target" },
      ] as EdgeSchema[]),
    )

    expect(matchesContactFilter).toHaveBeenCalledTimes(2)
    expect(matchesContactFilter).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactFilter: {
        operator: "and",
        conditions: [
          { field: "lastUserInputType", operator: "eq", value: "text" },
        ],
      },
    })
    expect(integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: expect.objectContaining({
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        nodeId: "second-target",
        origin: "webhook",
      }),
    })
  })

  test("routes to otherwise when no case matches", async () => {
    matchesContactFilter.mockResolvedValue(false)

    await handleCondition(
      makeProps(makeStep(), [
        { sourceHandle: "otherwise-handle", target: "otherwise-target" },
      ] as EdgeSchema[]),
    )

    expect(integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: expect.objectContaining({ nodeId: "otherwise-target" }),
    })
  })
})
