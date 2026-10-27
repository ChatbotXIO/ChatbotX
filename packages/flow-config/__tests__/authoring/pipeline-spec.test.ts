import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  compileFlowSpec,
  edgeSchema,
  type FlowAuthoringContext,
  FlowAuthoringException,
  type FlowSpec,
  flowSpecSchema,
  flowSpecStepTypes,
  flowVersionSchema,
  type PipelineStepSchema,
  pipelineStepActions,
  refineStepsByChannel,
} from "../../src"

const ctx: FlowAuthoringContext = {
  templatesByName: new Map(),
  customFieldsByName: new Map([
    ["Follow up on", { id: "7001", type: "datetime" }],
    ["Plan", { id: "7002", type: "text" }],
  ]),
  flowsByName: new Map(),
  pipelinesByReferenceName: new Map([
    [
      "sales",
      {
        id: "5001",
        name: "Sales",
        referenceName: "sales",
        stages: [
          { id: "5101", name: "New" },
          { id: "5102", name: "Won deal" },
          { id: "5103", name: "Dup" },
          { id: "5104", name: "Dup" },
        ],
        fields: [
          { id: "5201", name: "Budget", referenceName: "budget" },
          { id: "5202", name: "Source", referenceName: "source" },
        ],
      },
    ],
    [
      "support",
      {
        id: "5002",
        name: "Support",
        referenceName: "support",
        stages: [{ id: "5301", name: "Triage" }],
        fields: [],
      },
    ],
  ]),
}

const base = { type: "pipeline", pipeline: "sales" } as const

const parse = (steps: unknown): FlowSpec =>
  flowSpecSchema.parse({ formatVersion: 1, name: "Pipelines", steps })

const compile = (steps: unknown) => compileFlowSpec(parse(steps), ctx)

const stepOf = (steps: unknown, index = 0): PipelineStepSchema => {
  const node = compile(steps).nodes[index]
  if (node?.type !== "performAction") {
    throw new Error("expected a performAction node")
  }
  return node.data.details.steps[0] as PipelineStepSchema
}

const expectPublishable = (steps: unknown) => {
  const compiled = compile(steps)
  const nodes = z
    .array(flowVersionSchema)
    .superRefine(refineStepsByChannel)
    .safeParse(compiled.nodes)
  expect(nodes.success, JSON.stringify(nodes.error?.issues)).toBe(true)
  const edges = z.array(edgeSchema).safeParse(compiled.edges)
  expect(edges.success, JSON.stringify(edges.error?.issues)).toBe(true)
}

const issuesOf = (steps: unknown) => {
  const result = flowSpecSchema.safeParse({
    formatVersion: 1,
    name: "Pipelines",
    steps,
  })
  if (result.success) {
    throw new Error("expected the spec to be invalid")
  }
  return result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }))
}

const errorsOf = (steps: unknown) => {
  try {
    compile(steps)
  } catch (error) {
    if (error instanceof FlowAuthoringException) {
      return error.errors
    }
    throw error
  }
  throw new Error("expected compileFlowSpec to throw")
}

const validSteps: Record<string, Record<string, unknown>> = {
  addToPipeline: {
    title: "Deal for {{full_name}}",
    description: "From chat",
    status: "open",
    stage: "Won deal",
    assigneeMemberIds: ["11"],
    assigneeInboxTeamIds: ["12"],
    dueDate: { mode: "fixed", at: "2026-12-01T10:00:00Z" },
    fieldValues: [{ field: "budget", value: "{{budget}}" }],
  },
  moveToStage: { stage: "Won deal" },
  changeValue: { value: "120.5" },
  assign: { assigneeMemberIds: ["11"], assigneeInboxTeamIds: [] },
  changeStatus: { status: "won" },
  changePriority: { priority: "high" },
  changeDueDate: {
    dueDate: { mode: "customField", customFieldName: "Follow up on" },
  },
  changeTitle: { title: "New title" },
  setCustomField: { field: "source", value: "ads" },
  clearCustomField: { fields: ["budget", "source"] },
  changeDescription: { description: "Updated" },
  removeFromPipeline: {},
  addComment: { text: "Called the customer" },
  transfer: { destinationPipeline: "support", destinationStage: "Triage" },
}

describe("pipeline spec step", () => {
  test("is listed in the spec step types", () => {
    expect(flowSpecStepTypes.map((item) => item.type)).toContain("pipeline")
  })

  test("covers every pipeline action", () => {
    expect(Object.keys(validSteps).sort()).toEqual(
      [...pipelineStepActions.options].sort(),
    )
  })

  test.each(
    Object.keys(validSteps),
  )("%s compiles to a publishable pipeline step", (action) => {
    const steps = [{ ...base, action, ...validSteps[action] }]
    const step = stepOf(steps)
    expect(step.stepType).toBe("pipeline")
    expect(step.action).toBe(action)
    expect(step.pipelineId).toBe("5001")
    expectPublishable(steps)
  })

  test("resolves ids for stages, fields, due date and transfer", () => {
    expect(
      stepOf([
        { ...base, action: "addToPipeline", ...validSteps.addToPipeline },
      ]),
    ).toMatchObject({
      stageId: "5102",
      fieldValues: [{ pipelineFieldId: "5201", value: "{{budget}}" }],
      dueDate: { mode: "fixed", at: "2026-12-01T10:00:00Z" },
      assigneeMemberIds: ["11"],
      assigneeInboxTeamIds: ["12"],
    })
    expect(
      stepOf([
        { ...base, action: "changeDueDate", ...validSteps.changeDueDate },
      ]),
    ).toMatchObject({ dueDate: { mode: "customField", customFieldId: "7001" } })
    expect(
      stepOf([
        { ...base, action: "clearCustomField", ...validSteps.clearCustomField },
      ]),
    ).toMatchObject({ pipelineFieldIds: ["5201", "5202"] })
    expect(
      stepOf([{ ...base, action: "transfer", ...validSteps.transfer }]),
    ).toMatchObject({
      destinationPipelineId: "5002",
      destinationStageId: "5301",
    })
  })

  test("addToPipeline defaults match the editor defaults; pipeline may be an id", () => {
    expect(
      stepOf([{ type: "pipeline", pipeline: "5001", action: "addToPipeline" }]),
    ).toMatchObject({
      pipelineId: "5001",
      title: "{{full_name}}",
      status: "open",
      dueDate: { mode: "none" },
      fieldValues: [],
    })
  })

  describe("spec validation paths", () => {
    test("requires each action's fields", () => {
      expect(issuesOf([{ ...base, action: "moveToStage" }])).toEqual([
        {
          path: "steps.0.stage",
          message: 'action "moveToStage" requires stage',
        },
      ])
      expect(
        issuesOf([{ ...base, action: "setCustomField", field: "source" }]).map(
          (issue) => issue.path,
        ),
      ).toEqual(["steps.0.value"])
      expect(
        issuesOf([{ ...base, action: "clearCustomField", fields: [] }])[0],
      ).toMatchObject({ path: "steps.0.fields" })
      expect(issuesOf([{ ...base, action: "transfer" }])[0]?.path).toBe(
        "steps.0.destinationPipeline",
      )
    })

    test("transfer cannot target the step's own pipeline, by name or by id", () => {
      const salesId = "5001"
      for (const destinationPipeline of ["sales", salesId]) {
        expect(
          errorsOf([
            {
              ...base,
              pipeline: "sales",
              action: "transfer",
              destinationPipeline,
            },
          ]),
        ).toEqual([
          expect.objectContaining({
            path: "steps[0].destinationPipeline",
            code: "invalidStep",
          }),
        ])
      }
    })

    // The runtime rejects an assign with nobody to assign, so the spec must too.
    test("assign needs at least one member or team", () => {
      const expected = [
        {
          path: "steps.0.assigneeMemberIds",
          message:
            'action "assign" requires at least one of assigneeMemberIds, assigneeInboxTeamIds',
        },
      ]
      expect(issuesOf([{ ...base, action: "assign" }])).toEqual(expected)
      expect(
        issuesOf([
          {
            ...base,
            action: "assign",
            assigneeMemberIds: [],
            assigneeInboxTeamIds: [],
          },
        ]),
      ).toEqual(expected)
      expect(
        flowSpecSchema.safeParse({
          formatVersion: 1,
          name: "Pipelines",
          steps: [{ ...base, action: "assign", assigneeInboxTeamIds: ["12"] }],
        }).success,
      ).toBe(true)
    })

    test("rejects fields that the action does not accept", () => {
      expect(
        issuesOf([{ ...base, action: "removeFromPipeline", stage: "New" }]),
      ).toEqual([
        {
          path: "steps.0.stage",
          message: 'action "removeFromPipeline" does not accept stage',
        },
      ])
    })

    test("rejects onSkip for addToPipeline only", () => {
      expect(
        issuesOf([
          {
            ...base,
            action: "addToPipeline",
            onSkip: [{ type: "addNote", note: "x" }],
          },
        ]),
      ).toEqual([
        {
          path: "steps.0.onSkip",
          message:
            'action "addToPipeline" never skips, so onSkip would never run',
        },
      ])
      expect(() =>
        parse([
          {
            ...base,
            action: "moveToStage",
            stage: "New",
            onSkip: [{ type: "addNote", note: "x" }],
          },
        ]),
      ).not.toThrow()
    })

    test("rejects a malformed due date", () => {
      expect(
        issuesOf([
          {
            ...base,
            action: "changeDueDate",
            dueDate: { mode: "fixed", at: "soon" },
          },
        ]).length,
      ).toBeGreaterThan(0)
    })

    test("compiler also rejects onSkip for addToPipeline when parsing was bypassed", () => {
      const spec: FlowSpec = {
        formatVersion: 1,
        name: "x",
        steps: [
          {
            type: "pipeline",
            action: "addToPipeline",
            pipeline: "sales",
            onSkip: [{ type: "addNote", note: "x" }],
          },
        ],
      }
      expect(() => compileFlowSpec(spec, ctx)).toThrow(FlowAuthoringException)
    })
  })

  describe("reference errors", () => {
    test("unknown pipeline lists candidates", () => {
      const [error] = errorsOf([
        { ...base, pipeline: "sale", action: "removeFromPipeline" },
      ])
      expect(error).toMatchObject({
        path: "steps[0].pipeline",
        code: "unknownPipeline",
      })
      expect(error?.candidates).toContain("sales")
    })

    test("unknown stage lists candidates; duplicate names are ambiguous", () => {
      const [unknown] = errorsOf([
        { ...base, action: "moveToStage", stage: "Neww" },
      ])
      expect(unknown).toMatchObject({
        path: "steps[0].stage",
        code: "unknownPipelineStage",
      })
      expect(unknown?.candidates).toContain("New")
      const [dup] = errorsOf([{ ...base, action: "moveToStage", stage: "Dup" }])
      expect(dup).toMatchObject({ code: "ambiguousPipelineStage" })
    })

    test("unknown field, destination and due-date field", () => {
      expect(
        errorsOf([
          { ...base, action: "setCustomField", field: "bugdet", value: "1" },
        ])[0],
      ).toMatchObject({ path: "steps[0].field", code: "unknownPipelineField" })
      expect(
        errorsOf([
          {
            ...base,
            action: "addToPipeline",
            fieldValues: [{ field: "nope", value: "1" }],
          },
        ])[0]?.path,
      ).toBe("steps[0].fieldValues[0].field")
      expect(
        errorsOf([
          {
            ...base,
            action: "transfer",
            destinationPipeline: "x",
            destinationStage: "y",
          },
        ])[0],
      ).toMatchObject({
        path: "steps[0].destinationPipeline",
        code: "unknownPipeline",
      })
      expect(
        errorsOf([
          {
            ...base,
            action: "changeDueDate",
            dueDate: { mode: "customField", customFieldName: "Pla" },
          },
        ])[0],
      ).toMatchObject({
        path: "steps[0].dueDate.customFieldName",
        code: "unknownCustomField",
      })
      expect(
        errorsOf([
          {
            ...base,
            action: "changeDueDate",
            dueDate: { mode: "customField", customFieldName: "Plan" },
          },
        ])[0],
      ).toMatchObject({ code: "invalidSpec" })
    })

    test("stage of a destination pipeline resolves against that pipeline", () => {
      expect(
        errorsOf([
          {
            ...base,
            action: "transfer",
            destinationPipeline: "support",
            destinationStage: "New",
          },
        ])[0],
      ).toMatchObject({ path: "steps[0].destinationStage" })
    })
  })

  describe("routing", () => {
    const steps = [
      {
        ...base,
        id: "move",
        action: "moveToStage",
        stage: "New",
        onError: [{ type: "addNote", note: "failed" }],
        onSkip: [{ type: "addNote", note: "no item" }],
      },
      { type: "addNote", note: "after" },
    ]

    test("success continues to the next step; error and skip use their state handles", () => {
      const compiled = compile(steps)
      const [pipelineNode] = compiled.nodes
      if (pipelineNode?.type !== "performAction") {
        throw new Error("expected a performAction node")
      }
      const step = pipelineNode.data.details.steps[0] as PipelineStepSchema
      const handle = (type: string) =>
        step.states.find((state) => state.stateType === type)?.id
      const outgoing = compiled.edges.filter(
        (edge) => edge.source === pipelineNode?.id,
      )
      expect(outgoing).toHaveLength(3)

      const noteOf = (targetId: string) => {
        const node = compiled.nodes.find((item) => item.id === targetId)
        return node?.type === "addNotes"
          ? (node.data.details.beforeStep as { text: string }).text
          : undefined
      }
      const targetFor = (sourceHandle?: string) =>
        outgoing.find((edge) => edge.sourceHandle === sourceHandle)?.target
      expect(noteOf(targetFor(handle("error")) ?? "")).toBe("failed")
      expect(noteOf(targetFor(handle("skip")) ?? "")).toBe("no item")
      expect(noteOf(targetFor(pipelineNode?.id) ?? "")).toBe("after")
      expectPublishable(steps)
    })

    test("is not terminal and nested errors carry spec paths", () => {
      const [error] = errorsOf([
        {
          ...base,
          action: "removeFromPipeline",
          onError: [{ type: "startFlow", flowName: "Missing" }],
        },
      ])
      expect(error?.path).toBe("steps[0].onError[0].flowName")
    })

    test("onError can goto an earlier step", () => {
      expectPublishable([
        { type: "addNote", id: "start", note: "hi" },
        {
          ...base,
          action: "removeFromPipeline",
          onError: [{ type: "goto", targetId: "start" }],
        },
      ])
    })
  })
})
