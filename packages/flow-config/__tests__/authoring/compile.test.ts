import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  compileFlowSpec,
  edgeSchema,
  type FlowAuthoringContext,
  FlowAuthoringException,
  type FlowSpec,
  type FlowStepSpec,
  flowVersionSchema,
  nodeTypeSchema,
  parseFlowExport,
  refineStepsByChannel,
  stepTypes,
} from "../../src"

const emptyCtx: FlowAuthoringContext = {
  templatesByName: new Map(),
  customFieldsByName: new Map(),
  flowsByName: new Map(),
}

const ctx: FlowAuthoringContext = {
  templatesByName: new Map([
    ["welcome_promo", { id: "1001", language: "en", status: "APPROVED" }],
  ]),
  customFieldsByName: new Map([["Plan", { id: "1002", type: "text" }]]),
  flowsByName: new Map([["Nurture", { id: "1003" }]]),
}

const spec = (
  steps: FlowStepSpec[],
  overrides: Partial<FlowSpec> = {},
): FlowSpec => ({
  formatVersion: 1,
  name: "Test flow",
  steps,
  ...overrides,
})

/** Asserts the compiled graph is schema-valid exactly as publish requires. */
function expectPublishable(nodes: unknown, edges: unknown): void {
  const nodesResult = z
    .array(flowVersionSchema)
    .superRefine(refineStepsByChannel)
    .safeParse(nodes)
  expect(nodesResult.success, JSON.stringify(nodesResult.error?.issues)).toBe(
    true,
  )
  const edgesResult = z.array(edgeSchema).safeParse(edges)
  expect(edgesResult.success, JSON.stringify(edgesResult.error?.issues)).toBe(
    true,
  )
}

describe("compileFlowSpec — one node per step type", () => {
  test("send (text)", () => {
    const compiled = compileFlowSpec(
      spec([{ type: "send", text: "Hello!" }]),
      emptyCtx,
    )
    expect(compiled.nodes).toHaveLength(1)
    const node = compiled.nodes[0]
    expect(node?.type).toBe(nodeTypeSchema.enum.sendMessage)
    expect(compiled.startNodeId).toBe(node?.id)
    expect(node?.data.isStartNode).toBe(true)
    if (node?.type === "sendMessage") {
      expect(node.data.details.steps[0]).toMatchObject({
        stepType: stepTypes.enum.sendText,
        text: "Hello!",
      })
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test("send (image)", () => {
    const compiled = compileFlowSpec(
      spec([{ type: "send", imageUrl: "https://example.com/a.png" }]),
      emptyCtx,
    )
    const node = compiled.nodes[0]
    if (node?.type === "sendMessage") {
      expect(node.data.details.steps[0]).toMatchObject({
        stepType: stepTypes.enum.sendImage,
        url: "https://example.com/a.png",
      })
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test("send (file)", () => {
    const compiled = compileFlowSpec(
      spec([{ type: "send", fileUrl: "https://example.com/a.pdf" }]),
      emptyCtx,
    )
    const node = compiled.nodes[0]
    if (node?.type === "sendMessage") {
      expect(node.data.details.steps[0]).toMatchObject({
        stepType: stepTypes.enum.sendFile,
        url: "https://example.com/a.pdf",
      })
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test("sendTemplate resolves the template by name", () => {
    const compiled = compileFlowSpec(
      spec([{ type: "sendTemplate", templateName: "welcome_promo" }], {
        channel: "messenger",
      }),
      ctx,
    )
    const node = compiled.nodes[0]
    expect(node?.type).toBe(nodeTypeSchema.enum.sendMessage)
    if (node?.type === "sendMessage") {
      expect(node.data.details.beforeStep.channel).toBe("whatsapp")
      expect(node.data.details.steps[0]).toMatchObject({
        stepType: stepTypes.enum.sendWaTemplateMessage,
        template: { id: "1001", name: "welcome_promo", language: "en" },
      })
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test("send uses the flow channel or defaults to omnichannel", () => {
    const whatsapp = compileFlowSpec(
      spec([{ type: "send", text: "Hello!" }], { channel: "whatsapp" }),
      emptyCtx,
    )
    const omnichannel = compileFlowSpec(
      spec([{ type: "send", text: "Hello!" }]),
      emptyCtx,
    )

    expect(
      whatsapp.nodes[0]?.type === "sendMessage"
        ? whatsapp.nodes[0].data.details.beforeStep.channel
        : undefined,
    ).toBe("whatsapp")
    expect(
      omnichannel.nodes[0]?.type === "sendMessage"
        ? omnichannel.nodes[0].data.details.beforeStep.channel
        : undefined,
    ).toBe("omnichannel")
  })

  test("sendTemplate reports an unknown template with candidates", () => {
    try {
      compileFlowSpec(
        spec([{ type: "sendTemplate", templateName: "welcom_promo" }]),
        ctx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.path).toBe("steps[0].templateName")
      expect(authoringError?.code).toBe("unknownTemplate")
      expect(authoringError?.candidates).toContain("welcome_promo")
    }
  })

  test("wait", () => {
    const compiled = compileFlowSpec(
      spec([{ type: "wait", duration: 2, unit: "hours" }]),
      emptyCtx,
    )
    const node = compiled.nodes[0]
    expect(node?.type).toBe(nodeTypeSchema.enum.wait)
    if (node?.type === "wait") {
      expect(node.data.details.steps[0]).toMatchObject({
        duration: 2,
        unit: "hours",
      })
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test.each([
    ["addTags", { tagNames: ["VIP"] }, stepTypes.enum.addContactTag],
    ["removeTags", { tagNames: ["VIP"] }, stepTypes.enum.removeContactTag],
    [
      "setCustomField",
      { customFieldName: "Plan", value: "premium" },
      stepTypes.enum.setCustomField,
    ],
    [
      "assignConversation",
      { assigneeId: "user-1" },
      stepTypes.enum.assignConversation,
    ],
    ["archiveConversation", {}, stepTypes.enum.archiveConversation],
  ] as const)("action %s compiles to a performAction node", (action, extra, expectedStepType) => {
    const compiled = compileFlowSpec(
      spec([{ type: "action", action, ...extra } as FlowStepSpec]),
      ctx,
    )
    const node = compiled.nodes[0]
    expect(node?.type).toBe(nodeTypeSchema.enum.performAction)
    if (node?.type === "performAction") {
      const compiledStep = node.data.details.steps[0]
      expect(compiledStep?.stepType).toBe(expectedStepType)
      if (action === "setCustomField") {
        expect((compiledStep as { inputFieldId?: string })?.inputFieldId).toBe(
          "1002",
        )
      }
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test("action setCustomField reports an unknown custom field with candidates", () => {
    try {
      compileFlowSpec(
        spec([
          {
            type: "action",
            action: "setCustomField",
            customFieldName: "Pln",
            value: "premium",
          },
        ]),
        ctx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.path).toBe("steps[0].customFieldName")
      expect(authoringError?.code).toBe("unknownCustomField")
      expect(authoringError?.candidates).toContain("Plan")
    }
  })

  test("startFlow resolves the target flow by name", () => {
    const compiled = compileFlowSpec(
      spec([{ type: "startFlow", flowName: "Nurture" }]),
      ctx,
    )
    const node = compiled.nodes[0]
    expect(node?.type).toBe(nodeTypeSchema.enum.startFlow)
    if (node?.type === "startFlow") {
      expect(node.data.details.beforeStep.flowId).toBe("1003")
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test("startFlow reports an unknown flow with candidates", () => {
    try {
      compileFlowSpec(spec([{ type: "startFlow", flowName: "Nurtur" }]), ctx)
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.path).toBe("steps[0].flowName")
      expect(authoringError?.code).toBe("unknownFlow")
      expect(authoringError?.candidates).toContain("Nurture")
    }
  })

  test("addNote", () => {
    const compiled = compileFlowSpec(
      spec([{ type: "addNote", note: "Called back" }]),
      emptyCtx,
    )
    const node = compiled.nodes[0]
    expect(node?.type).toBe(nodeTypeSchema.enum.addNotes)
    if (node?.type === "addNotes") {
      expect(node.data.details.beforeStep.text).toBe("Called back")
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test("branch compiles to a condition node with cases and otherwise", () => {
    const compiled = compileFlowSpec(
      spec([
        {
          type: "branch",
          cases: [
            {
              when: [{ field: "email", operator: "isNotEmpty" }],
              // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
              then: [{ type: "addNote", note: "has email" }],
            },
          ],
          otherwise: [{ type: "addNote", note: "no email" }],
        },
      ]),
      emptyCtx,
    )
    expect(compiled.nodes).toHaveLength(3)
    const branchNode = compiled.nodes[0]
    expect(branchNode?.type).toBe(nodeTypeSchema.enum.condition)
    if (branchNode?.type === "condition") {
      const conditionStep = branchNode.data.details.steps[0]
      expect(conditionStep?.cases).toHaveLength(1)
      expect(conditionStep?.cases[0]?.conditions[0]).toMatchObject({
        field: "email",
        operator: "isNotEmpty",
      })
      const caseEdge = compiled.edges.find(
        (edge) => edge.sourceHandle === conditionStep?.cases[0]?.id,
      )
      const otherwiseEdge = compiled.edges.find(
        (edge) => edge.sourceHandle === conditionStep?.otherwiseId,
      )
      expect(caseEdge).toBeDefined()
      expect(otherwiseEdge).toBeDefined()
    }
    expectPublishable(compiled.nodes, compiled.edges)
  })

  test("rejects bot fields in branch conditions", () => {
    try {
      compileFlowSpec(
        spec([
          {
            type: "branch",
            cases: [
              {
                when: [{ field: "botField:email", operator: "isNotEmpty" }],
                // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
                then: [{ type: "addNote", note: "has email" }],
              },
            ],
          },
        ]),
        emptyCtx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.code).toBe("invalidSpec")
      expect(authoringError?.path).toBe("steps[0].cases[0].when[0].field")
    }
  })
})

describe("compileFlowSpec — reference resolution", () => {
  test("accumulates invalid names in spec order", () => {
    try {
      compileFlowSpec(
        spec([
          { type: "sendTemplate", templateName: "missing template" },
          {
            type: "action",
            action: "setCustomField",
            customFieldName: "missing field",
            value: "value",
          },
          { type: "startFlow", flowName: "missing flow" },
        ]),
        emptyCtx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      expect(
        (error as FlowAuthoringException).errors.map(({ code, path }) => ({
          code,
          path,
        })),
      ).toEqual([
        { code: "unknownTemplate", path: "steps[0].templateName" },
        { code: "unknownCustomField", path: "steps[1].customFieldName" },
        { code: "unknownFlow", path: "steps[2].flowName" },
      ])
    }
  })

  test("rejects a resolved template that is not approved", () => {
    const pendingTemplateCtx: FlowAuthoringContext = {
      ...emptyCtx,
      templatesByName: new Map([
        ["pending", { id: "1004", language: "en", status: "PENDING" }],
      ]),
    }

    try {
      compileFlowSpec(
        spec([{ type: "sendTemplate", templateName: "pending" }]),
        pendingTemplateCtx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.code).toBe("templateNotApproved")
      expect(authoringError?.path).toBe("steps[0].templateName")
      expect(authoringError?.hint).toBe(
        "Pick a template whose status is APPROVED in capabilities.get's templates list.",
      )
    }
  })
})

describe("compileFlowSpec — a realistic multi-step flow", () => {
  test("send → wait 1h → branch → sendTemplate", () => {
    const compiled = compileFlowSpec(
      spec(
        [
          { type: "send", text: "Hi! Thanks for reaching out." },
          { type: "wait", duration: 1, unit: "hours" },
          {
            type: "branch",
            cases: [
              {
                when: [{ field: "country", operator: "eq", value: "US" }],
                // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
                then: [{ type: "sendTemplate", templateName: "welcome_promo" }],
              },
            ],
          },
        ],
        { channel: "whatsapp" },
      ),
      ctx,
    )

    expect(compiled.nodes.map((node) => node.type)).toEqual([
      "sendMessage",
      "wait",
      "condition",
      "sendMessage",
    ])
    // send -> wait -> branch chained by Continue edges (source === sourceHandle === node id).
    const [sendNode, waitNode, branchNode] = compiled.nodes
    expect(
      compiled.edges.find(
        (edge) =>
          edge.source === sendNode?.id && edge.sourceHandle === sendNode?.id,
      )?.target,
    ).toBe(waitNode?.id)
    expect(
      compiled.edges.find(
        (edge) =>
          edge.source === waitNode?.id && edge.sourceHandle === waitNode?.id,
      )?.target,
    ).toBe(branchNode?.id)

    expectPublishable(compiled.nodes, compiled.edges)
  })
})

describe("compileFlowSpec — button routing", () => {
  test("a routed button writes both the node's beforeStep and a matching edge", () => {
    const compiled = compileFlowSpec(
      spec([
        {
          type: "send",
          text: "Want a discount?",
          buttons: [
            // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
            { text: "Yes", then: [{ type: "addNote", note: "said yes" }] },
            { text: "No" },
          ],
        },
      ]),
      emptyCtx,
    )

    const sendNode = compiled.nodes[0]
    expect(sendNode?.type).toBe("sendMessage")
    if (sendNode?.type !== "sendMessage") {
      throw new Error("expected sendMessage node")
    }
    const [yesButton, noButton] = sendNode.data.details.steps[0]?.buttons ?? []
    const noteNode = compiled.nodes[1]

    // Routed button: beforeStep points at the new node...
    expect(yesButton?.buttonType).toBe("startAnotherNode")
    if (yesButton?.buttonType === "startAnotherNode") {
      expect(yesButton.beforeStep.nodeId).toBe(noteNode?.id)
    }
    // ...and an edge exists for the same handle, to the same target.
    const edge = compiled.edges.find((e) => e.sourceHandle === yesButton?.id)
    expect(edge).toMatchObject({
      source: sendNode.id,
      target: noteNode?.id,
      targetHandle: noteNode?.id,
    })

    // Unrouted button stays inert — no beforeStep, no edge.
    expect(noButton?.buttonType).toBeNull()
    expect(
      compiled.edges.find((e) => e.sourceHandle === noButton?.id),
    ).toBeUndefined()

    expectPublishable(compiled.nodes, compiled.edges)
  })
})

describe("compileFlowSpec — goto", () => {
  test("jumps to an earlier step's node instead of creating a new one", () => {
    const compiled = compileFlowSpec(
      spec([
        { type: "addNote", id: "greet", note: "greeted" },
        { type: "wait", duration: 1, unit: "days" },
        { type: "goto", targetId: "greet" },
      ]),
      emptyCtx,
    )

    // "goto" creates no node of its own.
    expect(compiled.nodes).toHaveLength(2)
    const [greetNode, waitNode] = compiled.nodes
    const gotoEdge = compiled.edges.find(
      (edge) =>
        edge.source === waitNode?.id && edge.sourceHandle === waitNode?.id,
    )
    expect(gotoEdge?.target).toBe(greetNode?.id)
    for (const node of compiled.nodes) {
      expect(node.position.x).toEqual(expect.any(Number))
      expect(node.position.y).toEqual(expect.any(Number))
    }
  })

  test("wires a nested chain opening with goto directly to its target", () => {
    const compiled = compileFlowSpec(
      spec([
        { type: "addNote", id: "target", note: "target" },
        {
          type: "branch",
          cases: [
            {
              when: [{ field: "email", operator: "isNotEmpty" }],
              // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
              then: [{ type: "goto", targetId: "target" }],
            },
          ],
        },
      ]),
      emptyCtx,
    )

    expect(compiled.nodes).toHaveLength(2)
    const [targetNode, branchNode] = compiled.nodes
    if (branchNode?.type !== "condition") {
      throw new Error("expected condition node")
    }
    const caseId = branchNode.data.details.steps[0]?.cases[0]?.id
    expect(
      compiled.edges.find((edge) => edge.sourceHandle === caseId)?.target,
    ).toBe(targetNode?.id)
  })

  test("rejects goto as the first step", () => {
    try {
      compileFlowSpec(spec([{ type: "goto", targetId: "x" }]), emptyCtx)
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.code).toBe("invalidFirstStep")
      expect(authoringError?.path).toBe("steps[0]")
    }
  })

  test("rejects a goto to an unknown step id", () => {
    try {
      compileFlowSpec(
        spec([
          { type: "addNote", note: "hi" },
          { type: "goto", targetId: "does-not-exist" },
        ]),
        emptyCtx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.code).toBe("invalidGotoTarget")
      expect(authoringError?.path).toBe("steps[1].targetId")
    }
  })
})

describe("compileFlowSpec — structural validation", () => {
  test("reports an unreachable step after a terminal branch", () => {
    try {
      compileFlowSpec(
        spec([
          {
            type: "branch",
            cases: [
              {
                when: [{ field: "email", operator: "isNotEmpty" }],
                // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
                then: [{ type: "addNote", note: "x" }],
              },
            ],
          },
          { type: "addNote", note: "unreachable" },
        ]),
        emptyCtx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.code).toBe("unreachableStep")
      expect(authoringError?.path).toBe("steps[1]")
    }
  })

  test("reports duplicate step ids anywhere in the spec", () => {
    try {
      compileFlowSpec(
        spec([
          { type: "addNote", id: "dup", note: "a" },
          { type: "addNote", id: "dup", note: "b" },
        ]),
        emptyCtx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const codes = (error as FlowAuthoringException).errors.map((e) => e.code)
      expect(codes).toEqual(["duplicateStepId", "duplicateStepId"])
    }
  })

  test("reports duplicate ids across nesting levels", () => {
    try {
      compileFlowSpec(
        spec([
          {
            type: "branch",
            id: "dup",
            cases: [
              {
                when: [{ field: "email", operator: "isNotEmpty" }],
                // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
                then: [{ type: "addNote", id: "dup", note: "nested" }],
              },
            ],
          },
        ]),
        emptyCtx,
      )
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      expect(
        (error as FlowAuthoringException).errors.map(({ code, path }) => ({
          code,
          path,
        })),
      ).toEqual([
        { code: "duplicateStepId", path: "steps[0]" },
        {
          code: "duplicateStepId",
          path: "steps[0].cases[0].then[0]",
        },
      ])
    }
  })

  test("guards the compiler invariant when an unparsed spec has no steps", () => {
    // `FlowSpec` cannot encode flowSpecSchema's runtime `.min(1)` constraint.
    try {
      compileFlowSpec(spec([]), emptyCtx)
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = (error as FlowAuthoringException).errors[0]
      expect(authoringError?.code).toBe("compileFailed")
      expect(authoringError?.path).toBe("steps")
    }
  })
})

describe("compileFlowSpec — layout determinism", () => {
  test("compiling the same spec twice produces identical positions", () => {
    const buildSpec = () =>
      spec([
        { type: "send", text: "Hi" },
        {
          type: "branch",
          cases: [
            {
              when: [{ field: "email", operator: "isNotEmpty" }],
              // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
              then: [{ type: "addNote", note: "a" }],
            },
          ],
          otherwise: [{ type: "addNote", note: "b" }],
        },
      ])

    const first = compileFlowSpec(buildSpec(), emptyCtx)
    const second = compileFlowSpec(buildSpec(), emptyCtx)

    const positionsByOrder = (nodes: typeof first.nodes) =>
      nodes.map((node) => node.position)
    expect(positionsByOrder(first.nodes)).toEqual(
      positionsByOrder(second.nodes),
    )
  })
})

describe("compileFlowSpec — round-trip through the export schema", () => {
  test("a compiled graph parses as a valid flow export", () => {
    const compiled = compileFlowSpec(
      spec([
        { type: "send", text: "Hi!" },
        { type: "wait", duration: 1, unit: "hours" },
      ]),
      emptyCtx,
    )

    const result = parseFlowExport({
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [
        {
          name: "Test flow",
          active: true,
          enableInInbox: false,
          startNodeId: compiled.startNodeId,
          nodes: compiled.nodes,
          edges: compiled.edges,
        },
      ],
      customFields: {},
      botFields: {},
    })

    expect(result.ok, result.ok ? undefined : result.reason).toBe(true)
  })
})

describe("compileFlowSpec — specPathByNodeId", () => {
  test("maps a top-level step's node back to its spec path", () => {
    const compiled = compileFlowSpec(
      spec([{ type: "addNote", note: "Called back" }]),
      emptyCtx,
    )
    const node = compiled.nodes[0]
    expect(node && compiled.specPathByNodeId.get(node.id)).toBe("steps[0]")
  })

  test("maps a button's nested chain to its buttons[].then path", () => {
    const compiled = compileFlowSpec(
      spec([
        {
          type: "send",
          text: "Pick one",
          buttons: [
            {
              text: "Yes",
              // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
              then: [{ type: "addNote", note: "said yes" }],
            },
          ],
        },
      ]),
      emptyCtx,
    )
    const nestedNode = compiled.nodes.find(
      (node) => node.type === nodeTypeSchema.enum.addNotes,
    )
    expect(nestedNode && compiled.specPathByNodeId.get(nestedNode.id)).toBe(
      "steps[0].buttons[0].then[0]",
    )
  })

  test("maps a branch case's nested chain to its cases[].then path", () => {
    const compiled = compileFlowSpec(
      spec([
        {
          type: "branch",
          cases: [
            {
              when: [{ field: "email", operator: "isNotEmpty" }],
              // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
              then: [{ type: "addNote", note: "has email" }],
            },
          ],
        },
      ]),
      emptyCtx,
    )
    const branchNode = compiled.nodes[0]
    const nestedNode = compiled.nodes.find(
      (node) => node.type === nodeTypeSchema.enum.addNotes,
    )
    expect(branchNode && compiled.specPathByNodeId.get(branchNode.id)).toBe(
      "steps[0]",
    )
    expect(nestedNode && compiled.specPathByNodeId.get(nestedNode.id)).toBe(
      "steps[0].cases[0].then[0]",
    )
  })
})
