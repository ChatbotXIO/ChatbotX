import { describe, expect, test } from "vitest"
import { z } from "zod"
import { flowSpecSchema, flowSpecStepTypes } from "../../src"

type JsonSchemaNode = {
  description?: unknown
  properties?: Record<string, JsonSchemaNode>
  items?: JsonSchemaNode
  anyOf?: JsonSchemaNode[]
  $defs?: Record<string, JsonSchemaNode>
}

const isJsonSchemaNode = (value: unknown): value is JsonSchemaNode =>
  typeof value === "object" && value !== null

const expectInvalid = (value: unknown) => {
  const result = flowSpecSchema.safeParse(value)
  expect(result.success).toBe(false)
  if (result.success) {
    throw new Error("Expected flow spec validation to fail")
  }
  return result.error.issues
}

const createFlowSpec = (steps: unknown) => ({
  formatVersion: 1,
  name: "Customer follow-up",
  steps,
})

const createThreeLevelNestedFlowSpec = (deepStep: unknown) =>
  createFlowSpec([
    {
      type: "branch",
      cases: [
        {
          when: [
            {
              field: "email",
              operator: "equals",
              value: "customer@example.com",
            },
          ],
          // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
          then: [
            {
              type: "send",
              text: "Would you like to continue?",
              buttons: [
                {
                  text: "Continue",
                  // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
                  then: [
                    {
                      type: "branch",
                      cases: [
                        {
                          when: [
                            {
                              field: "firstName",
                              operator: "isNotEmpty",
                            },
                          ],
                          // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
                          then: [deepStep],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ])

const visitJsonSchema = (schema: JsonSchemaNode): void => {
  for (const [propertyName, propertySchema] of Object.entries(
    schema.properties ?? {},
  )) {
    const { description } = propertySchema
    expect(
      typeof description,
      `Property "${propertyName}" is missing a description`,
    ).toBe("string")
    if (typeof description === "string") {
      expect(description.trim().length).toBeGreaterThan(0)
    }
    visitJsonSchema(propertySchema)
  }

  if (schema.items && isJsonSchemaNode(schema.items)) {
    visitJsonSchema(schema.items)
  }
  for (const option of schema.anyOf ?? []) {
    visitJsonSchema(option)
  }
  for (const definition of Object.values(schema.$defs ?? {})) {
    visitJsonSchema(definition)
  }
}

describe("flowSpecSchema", () => {
  test("emits JSON Schema descriptions for every property, including recursive steps", () => {
    const jsonSchema = z.toJSONSchema(flowSpecSchema)
    expect(isJsonSchemaNode(jsonSchema)).toBe(true)
    if (!isJsonSchemaNode(jsonSchema)) {
      throw new Error(
        "Expected flowSpecSchema to serialize to a JSON Schema object",
      )
    }

    expect(typeof jsonSchema.description).toBe("string")
    if (typeof jsonSchema.description !== "string") {
      throw new Error("Expected flowSpecSchema to have a description")
    }
    expect(jsonSchema.description.trim()).not.toHaveLength(0)
    visitJsonSchema(jsonSchema)
  })

  test("requires exactly one send content kind", () => {
    const missingContentIssues = expectInvalid(
      createFlowSpec([{ type: "send" }]),
    )
    const multipleContentIssues = expectInvalid(
      createFlowSpec([
        {
          type: "send",
          text: "Hello",
          imageUrl: "https://example.com/image.png",
        },
      ]),
    )

    for (const issues of [missingContentIssues, multipleContentIssues]) {
      expect(issues).toContainEqual(
        expect.objectContaining({
          message: "Exactly one of text, imageUrl, or fileUrl is required.",
          path: ["steps", 0],
        }),
      )
    }
  })

  test("enforces action-specific required fields", () => {
    const missingTagsIssues = expectInvalid(
      createFlowSpec([{ type: "action", action: "addTags", tagNames: [] }]),
    )
    const missingCustomFieldIssues = expectInvalid(
      createFlowSpec([{ type: "action", action: "setCustomField" }]),
    )

    expect(missingTagsIssues).toContainEqual(
      expect.objectContaining({
        message: 'action "addTags" requires a non-empty tagNames',
        path: ["steps", 0, "tagNames"],
      }),
    )
    expect(missingCustomFieldIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'action "setCustomField" requires customFieldName',
          path: ["steps", 0, "customFieldName"],
        }),
        expect.objectContaining({
          message: 'action "setCustomField" requires value',
          path: ["steps", 0, "value"],
        }),
      ]),
    )
  })

  test("parses three nested branch/button levels and preserves a deep error path", () => {
    expect(
      flowSpecSchema.safeParse(
        createThreeLevelNestedFlowSpec({
          type: "addNote",
          note: "Internal note",
        }),
      ).success,
    ).toBe(true)

    const issues = expectInvalid(
      createThreeLevelNestedFlowSpec({ type: "addNote", note: "" }),
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        path: [
          "steps",
          0,
          "cases",
          0,
          "then",
          0,
          "buttons",
          0,
          "then",
          0,
          "cases",
          0,
          "then",
          0,
          "note",
        ],
      }),
    )
  })

  test("enforces flow spec limits", () => {
    const tooManyButtons = Array.from({ length: 4 }, (_, index) => ({
      text: `Option ${index + 1}`,
    }))

    for (const invalidSpec of [
      createFlowSpec([{ type: "send", text: "x".repeat(1001) }]),
      createFlowSpec([
        { type: "send", text: "Hello", buttons: tooManyButtons },
      ]),
      createFlowSpec([
        {
          type: "send",
          text: "Hello",
          buttons: [{ text: "x".repeat(21) }],
        },
      ]),
      {
        ...createFlowSpec([{ type: "send", text: "Hello" }]),
        name: "x".repeat(256),
      },
    ]) {
      expect(flowSpecSchema.safeParse(invalidSpec).success).toBe(false)
    }
  })
})

describe("flowSpecStepTypes", () => {
  test("derives one entry per flowStepSpecSchema member, each with a non-empty description", () => {
    expect(flowSpecStepTypes.length).toBeGreaterThan(0)
    for (const stepType of flowSpecStepTypes) {
      expect(stepType.type.length).toBeGreaterThan(0)
      expect(stepType.description.length).toBeGreaterThan(0)
    }
  })

  test("covers every step type the DSL union declares", () => {
    expect(flowSpecStepTypes.map((stepType) => stepType.type).sort()).toEqual(
      [
        "action",
        "addNote",
        "branch",
        "goto",
        "send",
        "sendTemplate",
        "startFlow",
        "wait",
      ].sort(),
    )
  })
})
