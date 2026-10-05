import { z } from "zod"

const stableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/)

const boundedTextSchema = z.string().trim().min(1).max(4_000)

export const decisionCredentialSchema = z
  .object({ apiKey: z.string().trim().min(1).max(2_048) })
  .strict()
export type DecisionCredential = z.infer<typeof decisionCredentialSchema>

export const decisionInputSchema = z
  .object({
    key: z.literal("currentMessage"),
    required: z.boolean().default(true),
  })
  .strict()
export type DecisionInput = z.infer<typeof decisionInputSchema>

const choiceOptionSchema = z
  .object({
    description: z.string().trim().max(1_000).optional(),
    label: boundedTextSchema.max(200),
    value: stableKeySchema,
  })
  .strict()

const scoreLevelSchema = z
  .object({
    description: z.string().trim().max(1_000).optional(),
    label: boundedTextSchema.max(200),
    value: z.number().finite(),
  })
  .strict()

export const decisionQuestionSchema = z.discriminatedUnion("type", [
  z
    .object({
      instructions: boundedTextSchema,
      key: stableKeySchema,
      label: boundedTextSchema.max(200),
      options: z.array(choiceOptionSchema).min(2).max(30),
      type: z.literal("choice"),
    })
    .strict()
    .superRefine((question, ctx) => {
      const values = question.options.map((option) => option.value)
      if (new Set(values).size !== values.length) {
        ctx.addIssue({
          code: "custom",
          message: "Choice option values must be unique",
          path: ["options"],
        })
      }
    }),
  z
    .object({
      instructions: boundedTextSchema,
      key: stableKeySchema,
      label: boundedTextSchema.max(200),
      levels: z.array(scoreLevelSchema).min(2).max(10),
      type: z.literal("score"),
    })
    .strict()
    .superRefine((question, ctx) => {
      const values = question.levels.map((level) => level.value)
      const isIncreasing = values.every(
        (value, index) => index === 0 || value > (values[index - 1] ?? value),
      )
      if (!isIncreasing) {
        ctx.addIssue({
          code: "custom",
          message: "Score levels must be strictly increasing",
          path: ["levels"],
        })
      }
    }),
  z
    .object({
      falseCriteria: boundedTextSchema,
      instructions: boundedTextSchema,
      key: stableKeySchema,
      label: boundedTextSchema.max(200),
      trueCriteria: boundedTextSchema,
      type: z.literal("noul"),
    })
    .strict(),
])
export type DecisionQuestion = z.infer<typeof decisionQuestionSchema>

export const decisionProfileContractSchema = z
  .object({
    fixture: z
      .object({ currentMessage: z.string().trim().max(4_000) })
      .strict()
      .optional(),
    inputs: z.array(decisionInputSchema).length(1),
    questions: z.array(decisionQuestionSchema).min(1).max(20),
  })
  .strict()
  .superRefine((contract, ctx) => {
    const keys = contract.questions.map((question) => question.key)
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        message: "Question keys must be unique",
        path: ["questions"],
      })
    }
  })
export type DecisionProfileContract = z.infer<
  typeof decisionProfileContractSchema
>

export const decisionAnswerSchema = z.discriminatedUnion("type", [
  z
    .object({
      choice: stableKeySchema,
      confidence: z.number().min(0).max(1).optional(),
      probabilities: z.record(stableKeySchema, z.number().min(0).max(1)).optional(),
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
    providerKind: z.enum(["typesafe", "systemOneCompatible", "openrouterDecision"]),
    status: z.enum(["enabled", "disabled"]),
  })
  .strict()
export type DecisionConnectionSafe = z.infer<
  typeof decisionConnectionSafeSchema
>
