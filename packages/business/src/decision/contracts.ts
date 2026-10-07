import { z } from "zod"

const stableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/)
const instructionSchema = z.string().trim().min(1).max(1000)
const descriptionSchema = z.string().trim().min(1).max(400)

export const decisionCredentialSchema = z
  .object({ apiKey: z.string().trim().min(1).max(2048) })
  .strict()
export type DecisionCredential = z.infer<typeof decisionCredentialSchema>

export const decisionInputSchema = z
  .object({ key: z.literal("currentMessage"), required: z.literal(true) })
  .strict()
const choiceOptionSchema = z
  .object({
    description: descriptionSchema,
    label: z.string().trim().min(1).max(200),
    value: stableKeySchema,
  })
  .strict()
const scoreLevelSchema = z
  .object({
    description: descriptionSchema,
    label: z.string().trim().min(1).max(20),
    value: z.number().int().min(1).max(10),
  })
  .strict()

export const decisionQuestionSchema = z.discriminatedUnion("type", [
  z
    .object({
      instructions: instructionSchema,
      key: stableKeySchema,
      label: z.string().trim().min(1).max(160),
      options: z.array(choiceOptionSchema).min(2).max(24),
      type: z.literal("choice"),
    })
    .strict()
    .superRefine((question, ctx) => {
      if (
        new Set(question.options.map((option) => option.value)).size !==
        question.options.length
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Choice option values must be unique",
          path: ["options"],
        })
      }
    }),
  z
    .object({
      instructions: instructionSchema,
      key: stableKeySchema,
      label: z.string().trim().min(1).max(160),
      levels: z.array(scoreLevelSchema).min(2).max(10),
      type: z.literal("score"),
    })
    .strict()
    .superRefine((question, ctx) => {
      if (!question.levels.every((level, index) => level.value === index + 1)) {
        ctx.addIssue({
          code: "custom",
          message: "Score levels must use consecutive ordinal values",
          path: ["levels"],
        })
      }
    }),
  z
    .object({
      falseCriteria: instructionSchema,
      instructions: instructionSchema,
      key: stableKeySchema,
      label: z.string().trim().min(1).max(160),
      trueCriteria: instructionSchema,
      type: z.literal("noul"),
    })
    .strict(),
])
export type DecisionQuestion = z.infer<typeof decisionQuestionSchema>

/** Provider-level shape, intentionally multi-question for connection tests. */
export const decisionProviderContractSchema = z
  .object({
    inputs: z.array(decisionInputSchema).length(1),
    questions: z.array(decisionQuestionSchema).min(1).max(20),
  })
  .strict()
  .superRefine((contract, ctx) => {
    if (
      new Set(contract.questions.map((question) => question.key)).size !==
      contract.questions.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Question keys must be unique",
        path: ["questions"],
      })
    }
  })
export type DecisionProviderContract = z.infer<
  typeof decisionProviderContractSchema
>

/** Persisted reusable profile: exactly one stable result question, no fixture. */
export const decisionProfileContractSchema =
  decisionProviderContractSchema.superRefine((contract, ctx) => {
    if (
      contract.questions.length !== 1 ||
      contract.questions[0]?.key !== "result"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A Decision Profile must contain exactly one result question",
        path: ["questions"],
      })
    }
  })
export type DecisionProfileContract = z.infer<
  typeof decisionProfileContractSchema
>

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

const choiceFormSchema = z
  .object({
    instructions: instructionSchema,
    options: z
      .array(
        z
          .object({ description: descriptionSchema, value: stableKeySchema })
          .strict(),
      )
      .min(2)
      .max(24),
    type: z.literal("choice"),
  })
  .strict()
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

export const decisionProfileFormSchema = z
  .object({
    connectionId: z.string().regex(/^\d+$/),
    decision: z.discriminatedUnion("type", [
      choiceFormSchema,
      scoreFormSchema,
      noulFormSchema,
    ]),
    description: z.string().trim().max(2000).nullable().optional(),
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
    const threshold = input.thresholdConfig
    if (!threshold) {
      return
    }
    let valid = false
    if (input.decision.type === "choice") {
      valid = threshold.type === "choice_confidence"
    } else if (input.decision.type === "noul") {
      valid = threshold.type === "noul_true_probability"
    } else {
      valid =
        threshold.type === "score" &&
        threshold.value >= 1 &&
        threshold.value <= input.decision.levels.length
    }
    if (!valid) {
      ctx.addIssue({
        code: "custom",
        message: "Threshold does not match the Decision configuration",
        path: ["thresholdConfig"],
      })
    }
  })
export type DecisionProfileForm = z.infer<typeof decisionProfileFormSchema>

export const compileNoulInstructions = (input: {
  falseCriteria: string
  instructions: string
  trueCriteria: string
}): string =>
  `${input.instructions}\n\nTRUE when:\n${input.trueCriteria}\n\nFALSE when:\n${input.falseCriteria}`

export const decisionAnswerSchema = z.discriminatedUnion("type", [
  z
    .object({
      choice: stableKeySchema,
      confidence: z.number().min(0).max(1).optional(),
      probabilities: z
        .record(stableKeySchema, z.number().min(0).max(1))
        .optional(),
      type: z.literal("choice"),
    })
    .strict(),
  z
    .object({
      confidence: z.number().min(0).max(1).optional(),
      score: z.number().finite(),
      type: z.literal("score"),
    })
    .strict(),
  z
    .object({
      confidence: z.number().min(0).max(1).optional(),
      noul: z.number().min(0).max(1),
      type: z.literal("noul"),
    })
    .strict(),
])
export type DecisionAnswer = z.infer<typeof decisionAnswerSchema>
export const decisionResultSchema = z
  .object({
    answers: z.record(stableKeySchema, decisionAnswerSchema),
    model: z.string().trim().min(1).max(256),
  })
  .strict()
export type DecisionResult = z.infer<typeof decisionResultSchema>

export const decisionConnectionSafeSchema = z
  .object({
    credentialConfigured: z.literal(true),
    defaultModel: z.string().nullable(),
    endpoint: z.string().nullable(),
    id: z.string(),
    lastTest: z
      .object({
        status: z.enum(["passed", "failed"]).nullable(),
        testedAt: z.date().nullable(),
      })
      .strict(),
    modelCatalog: z.array(z.string()),
    name: z.string(),
    providerKind: z.enum([
      "typesafe",
      "systemOneCompatible",
      "openrouterDecision",
    ]),
    status: z.enum(["enabled", "disabled"]),
  })
  .strict()
export type DecisionConnectionSafe = z.infer<
  typeof decisionConnectionSafeSchema
>
