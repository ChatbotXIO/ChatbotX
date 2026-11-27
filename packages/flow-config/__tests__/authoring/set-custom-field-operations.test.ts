import {
  FIELD_OPERATION_DEFINITIONS,
  fieldOperationCodes,
} from "@chatbotx.io/utils/custom-field-operation"
import { describe, expect, test } from "vitest"
import {
  compileFlowSpec,
  type FlowAuthoringContext,
  FlowAuthoringException,
  flowSpecSchema,
  isFieldOperandMissing,
  isOperandBlank,
  setCustomFieldActionSchema,
  setCustomFieldStepDefaultFn,
  setCustomFieldStepSchema,
} from "../../src"

const fields = [
  ["number", "number"],
  ["datetime", "datetime"],
  ["text", "shortText"],
  ["flag", "boolean"],
] as const

const ctx: FlowAuthoringContext = {
  templatesByName: new Map(),
  flowsByName: new Map(),
  customFieldsByName: new Map(
    fields.map(([name, type], index) => [
      name,
      { id: String(3000 + index), type },
    ]),
  ),
}

const compile = (customFieldName: string, operation?: string, value?: string) =>
  compileFlowSpec(
    {
      formatVersion: 1,
      name: "Flow",
      steps: [
        {
          type: "action",
          action: "setCustomField",
          customFieldName,
          operation,
          value,
        },
      ],
    },
    ctx,
  )

const compiledStep = (compiled: ReturnType<typeof compileFlowSpec>) => {
  const node = compiled.nodes[0]
  return (
    node?.type === "performAction" ? node.data.details.steps[0] : undefined
  ) as { operation?: string; value?: string } | undefined
}

const parseSpec = (action: Record<string, unknown>) =>
  flowSpecSchema.safeParse({
    formatVersion: 1,
    name: "Flow",
    steps: [{ type: "action", action: "setCustomField", ...action }],
  })

// One compatible field name per operation, taken from the registry.
const fieldFor = (code: (typeof fieldOperationCodes)[number]) => {
  const allowed = FIELD_OPERATION_DEFINITIONS[code]
    .allowedTypes as readonly string[]
  const [name] = fields.find(([, type]) => allowed.includes(type)) ?? []
  if (!name) {
    throw new Error(`no test field for ${code}`)
  }
  return name
}

describe("authoring setCustomField operation by apiName", () => {
  test.each(
    fieldOperationCodes.map((code) => [
      FIELD_OPERATION_DEFINITIONS[code].apiName,
      code,
    ]),
  )("%s compiles to %s", (apiName, code) => {
    const value = FIELD_OPERATION_DEFINITIONS[code].requiresOperand
      ? "1"
      : undefined

    const step = compiledStep(compile(fieldFor(code), apiName, value))

    expect(step?.operation).toBe(code)
  })

  test("an omitted operation compiles to O01", () => {
    expect(compiledStep(compile("number", undefined, "5"))?.operation).toBe(
      "O01",
    )
  })

  test.each(["clear", "setNow"])("%s compiles with no value", (operation) => {
    const field = operation === "setNow" ? "datetime" : "number"

    expect(compiledStep(compile(field, operation))?.operation).toBe(
      operation === "setNow" ? "O08" : "O06",
    )
  })

  test.each([
    ["flag", "increase", "1"],
    ["text", "formula", "1"],
    ["number", "setNow", undefined],
    ["flag", "append", "x"],
  ])("%s with %s is rejected at compile with invalidFieldOperation", (field, operation, value) => {
    try {
      compile(field, operation, value)
      throw new Error("expected compileFlowSpec to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const first = (error as FlowAuthoringException).errors[0]
      expect(first?.code).toBe("invalidFieldOperation")
      expect(first?.path).toBe("steps[0].operation")
    }
  })
})

describe("authoring setCustomField spec operands", () => {
  test.each([
    "increase",
    "decrease",
    "formula",
    "addDays",
  ])("%s rejects a blank or whitespace operand", (operation) => {
    expect(
      parseSpec({ customFieldName: "F", operation, value: "" }).success,
    ).toBe(false)
    expect(
      parseSpec({ customFieldName: "F", operation, value: "  " }).success,
    ).toBe(false)
    expect(parseSpec({ customFieldName: "F", operation }).success).toBe(false)
  })

  test("an explicit set without value is rejected exactly like an omitted operation", () => {
    const explicit = parseSpec({ customFieldName: "F", operation: "set" })
    const omitted = parseSpec({ customFieldName: "F" })

    expect(explicit.success).toBe(false)
    expect(omitted.success).toBe(false)
    expect(
      !explicit.success && explicit.error.issues.map((i) => i.message),
    ).toEqual(!omitted.success && omitted.error.issues.map((i) => i.message))
  })

  test.each(["clear", "setNow"])("%s needs no value", (operation) => {
    expect(parseSpec({ customFieldName: "F", operation }).success).toBe(true)
  })
})

describe("flow-config operand rule and legacy exemption", () => {
  test("only increase and decrease are exempt from the operand rule", () => {
    const exempt = fieldOperationCodes.filter(
      (code) => isOperandBlank(code, "") && !isFieldOperandMissing(code, ""),
    )

    expect(exempt).toEqual(["O04", "O05"])
  })

  test.each([
    "O04",
    "O05",
  ])("%s is exempt for blank input but not for new authoring", (code) => {
    expect(isFieldOperandMissing(code as "O04", "")).toBe(false)
    expect(isOperandBlank(code as "O04", "  ")).toBe(true)
  })

  test("stored flow JSON (operation O01, blank value) parses", () => {
    const stored = {
      ...setCustomFieldStepDefaultFn(),
      inputFieldId: "42",
      operation: "O01",
      value: "",
    }

    expect(setCustomFieldStepSchema.safeParse(stored).success).toBe(true)
    expect(
      setCustomFieldActionSchema.safeParse({
        customFieldId: "42",
        operation: "O01",
        value: "",
      }).success,
    ).toBe(true)
  })

  test("the operand rule reports on the value path", () => {
    const result = setCustomFieldStepSchema.safeParse({
      ...setCustomFieldStepDefaultFn(),
      inputFieldId: "42",
      operation: "O07",
      value: " ",
    })

    expect(!result.success && result.error.issues[0]?.path).toEqual(["value"])
  })
})
