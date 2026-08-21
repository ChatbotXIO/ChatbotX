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

  test("routes to otherwise when filter evaluation throws", async () => {
    matchesContactFilter.mockRejectedValue(new Error("filter failed"))

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

  test("does not enqueue when the matched handle has no connected edge", async () => {
    matchesContactFilter.mockResolvedValueOnce(true)

    await handleCondition(makeProps(makeStep(), []))

    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("passes variable-resolved case values to contact filter matching", async () => {
    const step = makeStep()
    const resolvedCases = step.cases.map((conditionCase) =>
      conditionCase.id === "first-case"
        ? {
            ...conditionCase,
            conditions: [
              {
                field: "fullName",
                operator: "eq",
                value: "Ada Lovelace",
              },
            ],
          }
        : conditionCase,
    )
    resolveContactVariablesDeep.mockResolvedValueOnce(resolvedCases)
    matchesContactFilter.mockResolvedValueOnce(true)

    await handleCondition(
      makeProps(step, [{ sourceHandle: "first-case", target: "first-target" }]),
    )

    expect(resolveContactVariablesDeep).toHaveBeenCalledWith(
      "contact-1",
      step.cases,
      { contactInbox, conversation },
    )
    expect(matchesContactFilter).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactFilter: {
        operator: "and",
        conditions: [
          {
            field: "fullName",
            operator: "eq",
            value: "Ada Lovelace",
          },
        ],
      },
    })
    expect(integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: expect.objectContaining({ nodeId: "first-target" }),
    })
  })

  test("threads appointmentId through variable resolution and the matched branch", async () => {
    const step = makeStep()
    matchesContactFilter.mockResolvedValueOnce(true)

    await handleCondition({
      ...makeProps(step, [
        { sourceHandle: "first-case", target: "first-target" },
      ]),
      appointmentId: "appointment-1",
    })

    expect(resolveContactVariablesDeep).toHaveBeenCalledWith(
      "contact-1",
      step.cases,
      expect.objectContaining({ appointmentId: "appointment-1" }),
    )
    expect(integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: expect.objectContaining({
        appointmentId: "appointment-1",
        nodeId: "first-target",
      }),
    })
  })

  test("threads the case timezone into contact filter matching", async () => {
    const step: ConditionStepSchema = {
      id: "condition-step-1",
      stepType: "condition",
      otherwiseId: "otherwise-handle",
      cases: [
        {
          id: "first-case",
          operator: "and",
          timezone: "Asia/Ho_Chi_Minh",
          conditions: [
            { field: "contactCreatedAt", operator: "eq", value: "2026-07-20" },
          ],
        },
      ],
    }
    matchesContactFilter.mockResolvedValueOnce(true)

    await handleCondition(
      makeProps(step, [
        { sourceHandle: "first-case", target: "first-target" },
      ] as EdgeSchema[]),
    )

    expect(matchesContactFilter).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactFilter: {
        operator: "and",
        conditions: [
          { field: "contactCreatedAt", operator: "eq", value: "2026-07-20" },
        ],
        timezone: "Asia/Ho_Chi_Minh",
      },
    })
  })
})
