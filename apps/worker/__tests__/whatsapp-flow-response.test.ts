import type { FlowNode } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, type Mock, test, vi } from "vitest"

// --- mock vars (must be declared before vi.mock calls) ---

const dbQueryIntegrationFindFirst = vi.fn()
const dbQueryContactCustomFieldFindFirst = vi.fn()
const setCustomFieldValues = vi.fn(async () => undefined)
const applyWhatsappFlowResponse = vi.fn(async () => undefined)

const dbUpdateWhere = vi.fn(async () => undefined)
const dbUpdateSet = vi.fn(() => ({ where: dbUpdateWhere }))
const dbUpdate = vi.fn(() => ({ set: dbUpdateSet }))

const dbInsertOnConflict = vi.fn(async () => undefined)
const dbInsertValues = vi.fn(() => ({ onConflictDoUpdate: dbInsertOnConflict }))
const dbInsert = vi.fn(() => ({ values: dbInsertValues }))

// --- mocks ---

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationWhatsappModel: { findFirst: dbQueryIntegrationFindFirst },
      contactCustomFieldModel: {
        findFirst: dbQueryContactCustomFieldFindFirst,
      },
    },
    update: dbUpdate,
    insert: dbInsert,
  },
  eq: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join("")),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactCustomFieldModel: {
    contactId: "contactId",
    customFieldId: "customFieldId",
  },
  whatsappFlowModel: {
    integrationWhatsappId: "integrationWhatsappId",
    sourceId: "sourceId",
    completedCount: "completedCount",
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const emitCustomFieldChanged = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged,
}))

// The handler now delegates custom-field writes to the business service (which
// owns normalization + change events). Mock the whole barrel so its real schema
// graph isn't pulled into this test's partial schema mock.
vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: {
    setValues: (...args: unknown[]) => setCustomFieldValues(...args),
  },
  whatsappFlowResponseService: {
    applyResponse: (...args: unknown[]) => applyWhatsappFlowResponse(...args),
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "test-id"),
  }
})

// --- imports after mocks ---

const { findWhatsappFlowStepByButtonId, applyWhatsappFlowResponseSideEffects } =
  await import("../src/integration/handlers/whatsapp-flow-response")

// --- helpers ---

function makeNode(steps: unknown[] = [], beforeStep?: unknown): FlowNode {
  return {
    id: "node-1",
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 100 },
    data: {
      name: "Node",
      isStartNode: false,
      details: {
        steps,
        ...(beforeStep ? { beforeStep } : {}),
      } as never,
    },
  }
}

function makeWhatsappFlowStep(buttonId: string) {
  return {
    id: "step-1",
    stepType: "whatsappFlow",
    text: "body",
    buttons: [
      {
        id: buttonId,
        label: "Go",
        buttonType: null,
        beforeStep: null,
        steps: [],
      },
    ],
    inboxId: null,
    flow: {
      id: "flow-1",
      sourceId: "wa-flow-1",
      startScreenId: "SCREEN_1",
      fieldMappings: [],
    },
  }
}

function makeContactInbox() {
  return { id: "ci-1", contactId: "contact-1", inboxId: "inbox-1" } as never
}

// --- tests ---

describe("findWhatsappFlowStepByButtonId", () => {
  test("returns step when button found in details.steps", () => {
    const step = makeWhatsappFlowStep("btn-1")
    const nodes = [makeNode([step])]
    const result = findWhatsappFlowStepByButtonId(nodes as FlowNode[], "btn-1")
    expect(result).toBe(step)
  })

  test("returns null when button not found in any node", () => {
    const step = makeWhatsappFlowStep("btn-1")
    const nodes = [makeNode([step])]
    const result = findWhatsappFlowStepByButtonId(
      nodes as FlowNode[],
      "btn-999",
    )
    expect(result).toBeNull()
  })

  test("returns null for nodes with no steps property", () => {
    const node = {
      id: "node-1",
      position: { x: 0, y: 0 },
      measured: { width: 100, height: 100 },
      data: { name: "Node", isStartNode: false, details: {} as never },
    }
    const result = findWhatsappFlowStepByButtonId([node] as FlowNode[], "btn-1")
    expect(result).toBeNull()
  })

  test("returns null when step type is not whatsappFlow", () => {
    const step = { id: "s-1", stepType: "sendText", buttons: [{ id: "btn-1" }] }
    const nodes = [makeNode([step])]
    const result = findWhatsappFlowStepByButtonId(nodes as FlowNode[], "btn-1")
    expect(result).toBeNull()
  })

  test("returns step when button found in details.beforeStep", () => {
    const beforeStep = makeWhatsappFlowStep("btn-before")
    const nodes = [makeNode([], beforeStep)]
    const result = findWhatsappFlowStepByButtonId(
      nodes as FlowNode[],
      "btn-before",
    )
    expect(result).toBe(beforeStep)
  })

  test("searches steps before beforeStep", () => {
    const stepsStep = makeWhatsappFlowStep("btn-in-steps")
    const beforeStep = makeWhatsappFlowStep("btn-before")
    const nodes = [makeNode([stepsStep], beforeStep)]
    expect(
      findWhatsappFlowStepByButtonId(nodes as FlowNode[], "btn-in-steps"),
    ).toBe(stepsStep)
    expect(
      findWhatsappFlowStepByButtonId(nodes as FlowNode[], "btn-before"),
    ).toBe(beforeStep)
  })

  test("searches across multiple nodes", () => {
    const step1 = makeWhatsappFlowStep("btn-node1")
    const step2 = { ...makeWhatsappFlowStep("btn-node2"), id: "step-2" }
    const nodes = [makeNode([step1]), makeNode([step2])]
    expect(
      findWhatsappFlowStepByButtonId(nodes as FlowNode[], "btn-node2"),
    ).toBe(step2)
  })
})

describe("applyWhatsappFlowResponseSideEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    applyWhatsappFlowResponse.mockResolvedValue(undefined)
    dbQueryIntegrationFindFirst.mockResolvedValue({ id: "wa-integration-1" })
    dbQueryContactCustomFieldFindFirst.mockResolvedValue(null)
    dbInsertOnConflict.mockResolvedValue(undefined)
    dbUpdateWhere.mockResolvedValue(undefined)
    emitCustomFieldChanged.mockResolvedValue(undefined)
  })

  test("returns early and logs warning when sourceId is empty", async () => {
    const { logger } = await import("../src/lib/logger")
    const step = makeWhatsappFlowStep("btn-1")
    step.flow.sourceId = ""

    await applyWhatsappFlowResponseSideEffects({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      step: step as never,
      flowResponse: {},
    })

    expect(logger.warn as Mock).toHaveBeenCalledOnce()
    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
  })

  test("delegates side effects when sourceId is present", async () => {
    const step = makeWhatsappFlowStep("btn-1")

    await applyWhatsappFlowResponseSideEffects({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      step: step as never,
      flowResponse: {},
    })

    expect(applyWhatsappFlowResponse).toHaveBeenCalledOnce()
    expect(applyWhatsappFlowResponse.mock.calls[0][0]).toEqual({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      flowSourceId: "wa-flow-1",
      fieldMappings: [],
      flowResponse: {},
    })
  })

  test("delegates mappings without customFieldId to the business service", async () => {
    const step = makeWhatsappFlowStep("btn-1")
    step.flow.fieldMappings = [
      { paramKey: "name", paramLabel: "Name", customFieldId: null },
    ] as never

    await applyWhatsappFlowResponseSideEffects({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      step: step as never,
      flowResponse: { name: "Alice" },
    })

    expect(applyWhatsappFlowResponse).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      flowSourceId: "wa-flow-1",
      fieldMappings: [
        { paramKey: "name", paramLabel: "Name", customFieldId: null },
      ],
      flowResponse: { name: "Alice" },
    })
  })

  test("delegates a valid mapping to the business service", async () => {
    const step = makeWhatsappFlowStep("btn-1")
    step.flow.fieldMappings = [
      { paramKey: "email", paramLabel: "Email", customFieldId: "cf-1" },
    ] as never

    await applyWhatsappFlowResponseSideEffects({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      step: step as never,
      flowResponse: { email: "user@example.com" },
    })

    expect(applyWhatsappFlowResponse).toHaveBeenCalledOnce()
    expect(applyWhatsappFlowResponse.mock.calls[0][0]).toEqual({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      flowSourceId: "wa-flow-1",
      fieldMappings: [
        { paramKey: "email", paramLabel: "Email", customFieldId: "cf-1" },
      ],
      flowResponse: { email: "user@example.com" },
    })
  })

  test("delegates raw response values before business serialization", async () => {
    const step = makeWhatsappFlowStep("btn-1")
    step.flow.fieldMappings = [
      { paramKey: "phone_number", customFieldId: "cf-2" },
    ] as never

    await applyWhatsappFlowResponseSideEffects({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      step: step as never,
      flowResponse: { phone_number: "0901234567" },
    })

    expect(applyWhatsappFlowResponse).toHaveBeenCalledOnce()
    expect(applyWhatsappFlowResponse.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        fieldMappings: [{ paramKey: "phone_number", customFieldId: "cf-2" }],
        flowResponse: { phone_number: "0901234567" },
      }),
    )
  })

  test("delegates missing response values to the business service", async () => {
    const step = makeWhatsappFlowStep("btn-1")
    step.flow.fieldMappings = [
      { paramKey: "missing_key", paramLabel: "Missing", customFieldId: "cf-3" },
    ] as never

    await applyWhatsappFlowResponseSideEffects({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      step: step as never,
      flowResponse: {},
    })

    expect(applyWhatsappFlowResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldMappings: [
          {
            paramKey: "missing_key",
            paramLabel: "Missing",
            customFieldId: "cf-3",
          },
        ],
        flowResponse: {},
      }),
    )
  })

  test("lets business service handle missing integrationWhatsapp", async () => {
    const step = makeWhatsappFlowStep("btn-1")

    await applyWhatsappFlowResponseSideEffects({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: makeContactInbox(),
      step: step as never,
      flowResponse: {},
    })

    expect(applyWhatsappFlowResponse).toHaveBeenCalledOnce()
  })
})
