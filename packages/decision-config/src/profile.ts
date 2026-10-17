import { z } from "zod"

export const decisionStableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/)

const instructionSchema = z.string().trim().min(1).max(1000)
const descriptionSchema = z.string().trim().min(1).max(400)
const idSchema = z.string().regex(/^\d+$/)

const choiceFormSchema = z
  .object({
    instructions: instructionSchema,
    options: z
      .array(
        z
          .object({
            description: descriptionSchema,
            value: decisionStableKeySchema,
          })
          .strict(),
      )
      .min(2)
      .max(24),
    type: z.literal("choice"),
  })
  .strict()
  .superRefine((decision, ctx) => {
    if (
      new Set(decision.options.map((option) => option.value)).size !==
      decision.options.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Choice option values must be unique",
        path: ["options"],
      })
    }
  })

const scoreFormSchema = z
  .object({
    instructions: instructionSchema,
    levels: z
      .array(z.object({ description: descriptionSchema }).strict())
      .min(2)
      .max(10),
    type: z.literal("score"),
  })
  .strict()

const noulFormSchema = z
  .object({
    falseCriteria: instructionSchema,
    instructions: instructionSchema,
    trueCriteria: instructionSchema,
    type: z.literal("noul"),
  })
  .strict()

export const decisionProfileThresholdConfigSchema = z.discriminatedUnion(
  "type",
  [
    z
      .object({
        minimum: z.number().min(0).max(1),
        type: z.literal("choice_confidence"),
      })
      .strict(),
    z
      .object({
        operator: z.enum(["gt", "gte", "lt", "lte"]),
        type: z.literal("score"),
        value: z.number().finite(),
      })
      .strict(),
    z
      .object({
        minimum: z.number().min(0).max(1),
        type: z.literal("noul_true_probability"),
      })
      .strict(),
  ],
)
export type DecisionProfileThresholdConfig = z.infer<
  typeof decisionProfileThresholdConfigSchema
>

export const globalRouterDestinationSchema = z.discriminatedUnion("type", [
  z.object({ id: idSchema, type: z.literal("flow") }).strict(),
  z.object({ id: idSchema, type: z.literal("aiAgent") }).strict(),
  z.object({ id: idSchema, type: z.literal("user") }).strict(),
  z.object({ id: idSchema, type: z.literal("team") }).strict(),
])
export type GlobalRouterDestination = z.infer<
  typeof globalRouterDestinationSchema
>

const globalRouterRouteSchema = z.discriminatedUnion("type", [
  z
    .object({
      destination: globalRouterDestinationSchema,
      type: z.literal("choice"),
      value: decisionStableKeySchema,
    })
    .strict(),
  z
    .object({
      destination: globalRouterDestinationSchema,
      from: z.number().int().min(1).max(10),
      to: z.number().int().min(1).max(10),
      type: z.literal("score"),
    })
    .strict()
    .refine((route) => route.from <= route.to, {
      message: "Score route start must not exceed its end",
      path: ["from"],
    }),
  z
    .object({
      destination: globalRouterDestinationSchema,
      type: z.literal("noul"),
      value: z.boolean(),
    })
    .strict(),
])
export type GlobalRouterRoute = z.infer<typeof globalRouterRouteSchema>

export const globalRouterMetadataMappingSchema = z.discriminatedUnion("value", [
  z
    .object({
      customFieldId: idSchema,
      customFieldType: z.enum(["shortText", "longText"]),
      value: z.literal("choice"),
    })
    .strict(),
  z
    .object({
      customFieldId: idSchema,
      customFieldType: z.literal("number"),
      value: z.enum([
        "confidence",
        "selectedProbability",
        "score",
        "probabilityTrue",
      ]),
    })
    .strict(),
])
export type GlobalRouterMetadataMapping = z.infer<
  typeof globalRouterMetadataMappingSchema
>

export const globalRouterConfigSchema = z
  .object({
    fallback: globalRouterDestinationSchema,
    metadataMappings: z
      .array(globalRouterMetadataMappingSchema)
      .max(60)
      .default([]),
    noul: z
      .object({
        falseMaximum: z.number().min(0).max(1).default(0.5),
        trueMinimum: z.number().min(0).max(1).default(0.5),
      })
      .strict()
      .default({ falseMaximum: 0.5, trueMinimum: 0.5 }),
    routes: z.array(globalRouterRouteSchema).max(60).default([]),
    version: z.literal(1).default(1),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.noul.falseMaximum > config.noul.trueMinimum) {
      ctx.addIssue({
        code: "custom",
        message: "Noul false maximum must not exceed true minimum",
        path: ["noul", "falseMaximum"],
      })
    }
    const ids = config.metadataMappings.map((mapping) => mapping.customFieldId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "A metadata custom field can only be mapped once",
        path: ["metadataMappings"],
      })
    }
    const routeKeys = new Set<string>()
    for (const [index, route] of config.routes.entries()) {
      let key: string | null = null
      if (route.type === "choice") {
        key = `choice:${route.value}`
      } else if (route.type === "noul") {
        key = `noul:${route.value}`
      }
      if (key && routeKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `A ${route.type} result can only have one route`,
          path: ["routes", index],
        })
      }
      if (key) {
        routeKeys.add(key)
      }
    }
    const metadataValues = new Set<string>()
    for (const [index, mapping] of config.metadataMappings.entries()) {
      if (metadataValues.has(mapping.value)) {
        ctx.addIssue({
          code: "custom",
          message: "A result value can only be mapped once",
          path: ["metadataMappings", index],
        })
      }
      metadataValues.add(mapping.value)
    }
    const scoreRoutes = config.routes.filter((route) => route.type === "score")
    for (const [index, route] of scoreRoutes.entries()) {
      if (
        scoreRoutes.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            route.from <= other.to &&
            other.from <= route.to,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Score routes cannot overlap",
          path: ["routes"],
        })
        break
      }
    }
  })
export type GlobalRouterConfig = z.infer<typeof globalRouterConfigSchema>

export const compileNoulInstructions = (input: {
  falseCriteria: string
  instructions: string
  trueCriteria: string
}) =>
  `${input.instructions}\n\nTRUE when:\n${input.trueCriteria}\n\nFALSE when:\n${input.falseCriteria}`

export const decisionProfileFormSchema = z
  .object({
    connectionId: idSchema,
    decision: z.discriminatedUnion("type", [
      choiceFormSchema,
      scoreFormSchema,
      noulFormSchema,
    ]),
    description: z.string().trim().max(2000).nullable().optional(),
    globalRouterConfig: globalRouterConfigSchema.nullable().default(null),
    globalRouterEnabled: z.boolean().default(false),
    model: z.string().trim().min(1).max(256),
    name: z.string().trim().min(1).max(160),
    status: z.enum(["enabled", "disabled"]).default("enabled"),
    thresholdConfig: decisionProfileThresholdConfigSchema
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.decision.type === "noul" &&
      compileNoulInstructions(input.decision).length > 1000
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Noul instructions exceed the provider limit",
        path: ["decision"],
      })
    }
    if (input.globalRouterEnabled && !input.globalRouterConfig) {
      ctx.addIssue({
        code: "custom",
        message: "Global Router fallback configuration is required",
        path: ["globalRouterConfig"],
      })
    }
    const threshold = input.thresholdConfig
    if (threshold) {
      const valid =
        (input.decision.type === "choice" &&
          threshold.type === "choice_confidence") ||
        (input.decision.type === "noul" &&
          threshold.type === "noul_true_probability") ||
        (input.decision.type === "score" &&
          threshold.type === "score" &&
          threshold.value >= 1 &&
          threshold.value <= input.decision.levels.length)
      if (!valid) {
        ctx.addIssue({
          code: "custom",
          message: "Threshold does not match the Decision configuration",
          path: ["thresholdConfig"],
        })
      }
    }
  })
/** Authoring forms intentionally use the pre-default input shape. */
export type DecisionProfileForm = z.input<typeof decisionProfileFormSchema>
