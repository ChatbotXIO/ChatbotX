import { describe, expect, test } from "vitest"
import { z } from "zod"
import { flowSpecSchema, flowSpecStepTypes } from "../../src"

type JsonSchemaNode = {
  description?: unknown
  properties?: Record<string, JsonSchemaNode>
  items?: JsonSchemaNode
  anyOf?: JsonSchemaNode[]
  allOf?: JsonSchemaNode[]
  oneOf?: JsonSchemaNode[]
  $defs?: Record<string, JsonSchemaNode>
  maxLength?: unknown
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
  for (const option of schema.allOf ?? []) {
    visitJsonSchema(option)
  }
  for (const option of schema.oneOf ?? []) {
    visitJsonSchema(option)
  }
}

const findJsonSchemaNode = (
  schema: JsonSchemaNode,
  description: string,
): JsonSchemaNode | undefined => {
  if (schema.description === description) {
    return schema
  }

  for (const property of Object.values(schema.properties ?? {})) {
    const found = findJsonSchemaNode(property, description)
    if (found) {
      return found
    }
  }
  if (schema.items) {
    const found = findJsonSchemaNode(schema.items, description)
    if (found) {
      return found
    }
  }
  for (const option of schema.anyOf ?? []) {
    const found = findJsonSchemaNode(option, description)
    if (found) {
      return found
    }
  }
  for (const definition of Object.values(schema.$defs ?? {})) {
    const found = findJsonSchemaNode(definition, description)
    if (found) {
      return found
    }
  }
  for (const option of schema.allOf ?? []) {
    const found = findJsonSchemaNode(option, description)
    if (found) {
      return found
    }
  }
  for (const option of schema.oneOf ?? []) {
    const found = findJsonSchemaNode(option, description)
    if (found) {
      return found
    }
  }
}

const hasJsonSchemaMaxLength = (
  schema: JsonSchemaNode | undefined,
  maxLength: number,
): boolean =>
  schema?.maxLength === maxLength ||
  (schema?.allOf ?? []).some((option) =>
    hasJsonSchemaMaxLength(option, maxLength),
  ) ||
  (schema?.anyOf ?? []).some((option) =>
    hasJsonSchemaMaxLength(option, maxLength),
  ) ||
  (schema?.oneOf ?? []).some((option) =>
    hasJsonSchemaMaxLength(option, maxLength),
  )

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

  test("publishes text and label maximum lengths in JSON Schema", () => {
    const jsonSchema = z.toJSONSchema(flowSpecSchema)
    expect(isJsonSchemaNode(jsonSchema)).toBe(true)
    if (!isJsonSchemaNode(jsonSchema)) {
      throw new Error("Expected flowSpecSchema to serialize to JSON Schema")
    }

    const labelSchema = findJsonSchemaNode(
      jsonSchema,
      "Button label shown to the contact (max 20 characters).",
    )
    const textSchema = findJsonSchemaNode(
      jsonSchema,
      "Text message body (max 1000 characters). Exactly one of text/imageUrl/fileUrl is required.",
    )

    expect(hasJsonSchemaMaxLength(labelSchema, 20)).toBe(true)
    expect(hasJsonSchemaMaxLength(textSchema, 1000)).toBe(true)
  })

  test("publishes the sendViewCatalog length limits to agents", () => {
    const jsonSchema = z.toJSONSchema(flowSpecSchema)
    if (!isJsonSchemaNode(jsonSchema)) {
      throw new Error("Expected flowSpecSchema to serialize to JSON Schema")
    }

    const textSchema = findJsonSchemaNode(
      jsonSchema,
      "Message text shown above the catalog button (max 1024 characters, counted in UTF-16 units so an emoji may count as 2). May include `{{variable}}` placeholders.",
    )
    const footerSchema = findJsonSchemaNode(
      jsonSchema,
      "Optional small text under the message (max 60 characters, UTF-16 units; use an empty string for none). May include `{{variable}}` placeholders.",
    )

    expect(hasJsonSchemaMaxLength(textSchema, 1024)).toBe(true)
    expect(hasJsonSchemaMaxLength(footerSchema, 60)).toBe(true)
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

  describe("button count against the flow's own channel", () => {
    const sendWith = (count: number) => ({
      type: "send",
      text: "Pick one",
      buttons: Array.from({ length: count }, (_, index) => ({
        text: `B${index + 1}`,
      })),
    })
    const withChannel = (channel: string | undefined, steps: unknown[]) => ({
      ...createFlowSpec(steps),
      ...(channel ? { channel } : {}),
    })

    test("no channel (omnichannel) allows 3: 4 is rejected at the step's buttons", () => {
      expect(
        flowSpecSchema.safeParse(withChannel(undefined, [sendWith(3)])).success,
      ).toBe(true)

      const issues = expectInvalid(withChannel(undefined, [sendWith(4)]))
      expect(issues).toContainEqual(
        expect.objectContaining({
          path: ["steps", 0, "buttons"],
          params: {
            capability: expect.objectContaining({
              actual: 4,
              allowed: 3,
              channel: "omnichannel",
              code: "constraintExceeded",
              constraintId: "maxButtonCount",
            }),
          },
        }),
      )
    })

    test("each channel uses its own step limit", () => {
      for (const [channel, allowed] of [
        ["messenger", 3],
        ["line", 5],
        ["telegram", 10],
      ] as const) {
        expect(
          flowSpecSchema.safeParse(withChannel(channel, [sendWith(allowed)]))
            .success,
        ).toBe(true)
        if (allowed < 10) {
          expect(
            flowSpecSchema.safeParse(
              withChannel(channel, [sendWith(allowed + 1)]),
            ).success,
          ).toBe(false)
        }
      }
    })

    test("send steps nested under a button's then and a branch are checked", () => {
      const nestedInButton = expectInvalid(
        withChannel(undefined, [
          {
            type: "send",
            text: "Start",
            buttons: [
              {
                text: "Go",
                // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
                then: [sendWith(4)],
              },
            ],
          },
        ]),
      )
      expect(nestedInButton).toContainEqual(
        expect.objectContaining({
          path: ["steps", 0, "buttons", 0, "then", 0, "buttons"],
        }),
      )

      const nestedInBranch = expectInvalid(
        withChannel(undefined, [
          {
            type: "branch",
            cases: [
              {
                when: [{ field: "email", operator: "isNotEmpty" }],
                // biome-ignore lint/suspicious/noThenProperty: DSL fixture data
                then: [sendWith(4)],
              },
            ],
            otherwise: [sendWith(4)],
          },
        ]),
      )
      expect(nestedInBranch).toContainEqual(
        expect.objectContaining({
          path: ["steps", 0, "cases", 0, "then", 0, "buttons"],
        }),
      )
      expect(nestedInBranch).toContainEqual(
        expect.objectContaining({
          path: ["steps", 0, "otherwise", 0, "buttons"],
        }),
      )
    })
  })

  test("enforces flow spec limits", () => {
    // Above every channel's step limit (Telegram's 10 is the largest).
    const tooManyButtons = Array.from({ length: 11 }, (_, index) => ({
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
        "pipeline",
        "send",
        "sendProducts",
        "sendTemplate",
        "sendViewCatalog",
        "startFlow",
        "wait",
      ].sort(),
    )
  })
})

describe("setCustomField action operation", () => {
  const parse = (action: Record<string, unknown>) =>
    flowSpecSchema.safeParse({
      formatVersion: 1,
      name: "Flow",
      steps: [{ type: "action", action: "setCustomField", ...action }],
    })

  test("clear and setNow need no value", () => {
    expect(parse({ customFieldName: "F", operation: "clear" }).success).toBe(
      true,
    )
    expect(parse({ customFieldName: "F", operation: "setNow" }).success).toBe(
      true,
    )
  })

  test("an operation that needs an operand rejects a missing one", () => {
    expect(parse({ customFieldName: "F", operation: "addDays" }).success).toBe(
      false,
    )
  })

  test("new authoring input rejects a blank operand for increase and decrease", () => {
    for (const operation of ["increase", "decrease"]) {
      expect(parse({ customFieldName: "F", operation }).success).toBe(false)
      expect(
        parse({ customFieldName: "F", operation, value: "2" }).success,
      ).toBe(true)
    }
  })

  test("an explicit set needs a value just like an omitted operation", () => {
    expect(parse({ customFieldName: "F", operation: "set" }).success).toBe(
      false,
    )
    expect(
      parse({ customFieldName: "F", operation: "set", value: "x" }).success,
    ).toBe(true)
  })

  test("an unknown operation name is rejected", () => {
    expect(
      parse({ customFieldName: "F", operation: "multiply", value: "1" })
        .success,
    ).toBe(false)
  })

  test("without an operation the value stays required", () => {
    expect(parse({ customFieldName: "F" }).success).toBe(false)
  })
})

describe("flowSpecSchema button style", () => {
  test("accepts the three styles and no style; rejects any other value", () => {
    for (const style of ["primary", "secondary", "link", undefined]) {
      expect(
        flowSpecSchema.safeParse(
          createFlowSpec([
            { type: "send", text: "Hi", buttons: [{ text: "Go", style }] },
          ]),
        ).success,
      ).toBe(true)
    }
    expect(
      flowSpecSchema.safeParse(
        createFlowSpec([
          {
            type: "send",
            text: "Hi",
            buttons: [{ text: "Go", style: "danger" }],
          },
        ]),
      ).success,
    ).toBe(false)
  })
})
