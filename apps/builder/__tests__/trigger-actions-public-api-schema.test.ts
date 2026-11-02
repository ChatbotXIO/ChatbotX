import { describe, expect, test } from "vitest"
import { setCustomField } from "@/features/triggers/components/actions/schema/set-custom-field"
import { updateTriggerSchema } from "@/features/triggers/schema/mutation"
import { triggerResource } from "@/features/triggers/schema/resource"

const put = (actions: unknown[]) =>
  updateTriggerSchema.safeParse({ conditions: [], actions })

const parsedActions = (actions: unknown[]) => {
  const result = put(actions)
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues))
  }
  return result.data.actions as Record<string, unknown>[]
}

const pipelineId = "101"
const base = { type: "pipeline", pipelineId }

const pipelineVariants: [string, Record<string, unknown>][] = [
  [
    "addToPipeline",
    {
      action: "addToPipeline",
      title: "{{full_name}}",
      description: "",
      assigneeMemberIds: ["1"],
      assigneeInboxTeamIds: ["2"],
      status: "open",
      stageId: "201",
      dueDate: { mode: "none" },
      fieldValues: [{ pipelineFieldId: "301", value: "{{x}}" }],
    },
  ],
  ["moveToStage", { action: "moveToStage", stageId: "201" }],
  ["changeValue", { action: "changeValue", value: "10" }],
  [
    "assign",
    { action: "assign", assigneeMemberIds: ["1"], assigneeInboxTeamIds: [] },
  ],
  ["changeStatus", { action: "changeStatus", status: "won" }],
  ["changePriority", { action: "changePriority", priority: "high" }],
  [
    "changeDueDate",
    {
      action: "changeDueDate",
      dueDate: { mode: "customField", customFieldId: "5" },
    },
  ],
  ["changeTitle", { action: "changeTitle", title: "t" }],
  [
    "setCustomField",
    { action: "setCustomField", pipelineFieldId: "301", value: "v" },
  ],
  [
    "clearCustomField",
    { action: "clearCustomField", pipelineFieldIds: ["301"] },
  ],
  ["changeDescription", { action: "changeDescription", description: "d" }],
  ["removeFromPipeline", { action: "removeFromPipeline" }],
  ["addComment", { action: "addComment", text: "hi" }],
  [
    "transfer",
    {
      action: "transfer",
      destinationPipelineId: "102",
      destinationStageId: "202",
    },
  ],
]

describe("triggers PUT normalizes actions through Zod", () => {
  test("unknown extra properties on a known action are stripped", () => {
    const [action] = parsedActions([
      { type: "addTag", tagIds: ["1"], legacyJunk: true },
    ])

    expect(action).toEqual({ type: "addTag", tagIds: ["1"] })
  })

  test("extra properties are stripped from the new action shapes too", () => {
    const actions = parsedActions([
      { ...base, action: "removeFromPipeline", junk: 1 },
      { type: "startExternalStep", flowId: "11", nodeId: "22", junk: 1 },
    ])

    expect(actions).toEqual([
      { ...base, action: "removeFromPipeline" },
      { type: "startExternalStep", flowId: "11", nodeId: "22" },
    ])
  })

  test("an unknown action type is rejected", () => {
    expect(put([{ type: "teleport", flowId: "1" }]).success).toBe(false)
  })

  test("startExternalStep without a nodeId is rejected", () => {
    expect(put([{ type: "startExternalStep", flowId: "11" }]).success).toBe(
      false,
    )
  })
})

describe("triggers GET output keeps what is stored", () => {
  // `actions` is `z.array(z.unknown())` (not a passthrough union): nothing is
  // validated or stripped on read, so legacy rows come back untouched.
  test("unknown legacy properties survive the output schema", () => {
    const legacy = [
      { type: "addTag", tagIds: ["1"], oldProp: "keep" },
      { type: "someRetiredAction", whatever: { nested: [1] } },
    ]
    const row = {
      id: "1",
      workspaceId: "2",
      folderId: null,
      name: "t",
      conditions: [],
      actions: legacy,
    }

    const shape = triggerResource.shape.actions.safeParse(legacy)

    expect(shape.success && shape.data).toEqual(legacy)
    expect(row.actions).toBe(legacy)
  })
})

describe("every new action shape parses", () => {
  test.each(pipelineVariants)("pipeline %s round-trips", (_name, fields) => {
    const stored = { ...base, ...fields }

    expect(parsedActions([stored])).toEqual([stored])
  })

  test("covers all 14 pipeline variants", () => {
    expect(new Set(pipelineVariants.map(([name]) => name)).size).toBe(14)
  })

  test.each([
    ["none", { mode: "none" }],
    ["customField", { mode: "customField", customFieldId: "5" }],
    ["customField (unset draft)", { mode: "customField", customFieldId: "" }],
    ["fixed", { mode: "fixed", at: "2030-01-01T10:00:00+07:00" }],
  ])("changeDueDate accepts dueDate mode %s", (_n, dueDate) => {
    expect(put([{ ...base, action: "changeDueDate", dueDate }]).success).toBe(
      true,
    )
  })

  test("addToPipeline accepts every dueDate mode and fieldValues", () => {
    const addTo = pipelineVariants[0]?.[1] ?? {}
    for (const dueDate of [
      { mode: "none" },
      { mode: "customField", customFieldId: "5" },
      { mode: "fixed", at: "2030-01-01T10:00:00Z" },
    ]) {
      expect(put([{ ...base, ...addTo, dueDate }]).success).toBe(true)
    }
  })

  test("a pipeline dueDate with mode relative is rejected", () => {
    expect(
      put([
        {
          ...base,
          action: "changeDueDate",
          dueDate: { mode: "relative", amount: 2, unit: "days" },
        },
      ]).success,
    ).toBe(false)
  })

  test("setCustomField with operation and timezone parses and keeps both", () => {
    const stored = {
      type: "setCustomField",
      customFieldId: "42",
      operation: "O12",
      value: "3",
      timezone: "Asia/Bangkok",
    }

    expect(parsedActions([stored])).toEqual([stored])
  })
})

describe("old stored shapes parse unchanged", () => {
  test.each([
    { type: "addTag", tagIds: ["1", "2"] },
    { type: "removeTag", tagIds: ["1"] },
    { type: "startAnotherFlow", flowId: "9" },
    { type: "clearCustomField", customFieldId: "42" },
    {
      type: "setCustomField",
      customFieldId: "42",
      operation: "O01",
      value: "",
    },
    {
      type: "setCustomField",
      customFieldId: "42",
      operation: "O02",
      value: "",
    },
    {
      type: "setCustomField",
      customFieldId: "42",
      operation: "O03",
      value: "",
    },
    {
      type: "setCustomField",
      customFieldId: "42",
      operation: "O04",
      value: "",
    },
    {
      type: "setCustomField",
      customFieldId: "42",
      operation: "O05",
      value: "",
    },
  ])("round-trips %j byte for byte", (stored) => {
    const [action] = parsedActions([stored])

    expect(action).toEqual(stored)
    expect(Object.keys(action ?? {}).sort()).toEqual(Object.keys(stored).sort())
    expect(JSON.stringify(action, Object.keys(stored).sort())).toBe(
      JSON.stringify(stored, Object.keys(stored).sort()),
    )
  })
})

describe("legacy setCustomField operand rules (N14)", () => {
  const stored = (patch: Record<string, unknown>) => ({
    type: "setCustomField",
    customFieldId: "42",
    ...patch,
  })

  // Documented behaviour: the trigger PUT schema requires `operation`. A row
  // that predates operations (no `operation`) is NOT accepted on write; the
  // worker reads it through `setCustomFieldActionSchema`, which defaults it to
  // O01, so already-stored rows keep running.
  test.each([
    ["absent operation, absent value", {}],
    ["absent operation, blank value", { value: "" }],
    ["blank operation, absent value", { operation: "" }],
  ])("%s is rejected on PUT at the operation path", (_n, patch) => {
    const result = setCustomField.safeParse(stored(patch))

    expect(result.success).toBe(false)
    expect(
      !result.success &&
        result.error.issues.some((issue) => issue.path[0] === "operation"),
    ).toBe(true)
  })

  test.each([
    "O01",
    "O02",
    "O03",
    "O04",
    "O05",
  ])("explicit %s with a blank value is accepted", (operation) => {
    expect(
      setCustomField.safeParse(stored({ operation, value: "" })).success,
    ).toBe(true)
  })

  test("absent value defaults to blank for an operation that tolerates it", () => {
    const result = setCustomField.safeParse(stored({ operation: "O02" }))

    expect(result.success && result.data.value).toBe("")
  })

  test.each([
    "O07",
    "O09",
    "O10",
    "O11",
    "O12",
  ])("%s with a blank or whitespace value is rejected at path value", (operation) => {
    for (const value of ["", "   "]) {
      const result = setCustomField.safeParse(stored({ operation, value }))

      expect(result.success).toBe(false)
      expect(!result.success && result.error.issues[0]?.path).toEqual(["value"])
    }
  })
})
