import { z } from "zod"

const key = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/)
const text = z.string().trim().min(1).max(1000)
const description = z.string().trim().min(1).max(400)

export const decisionProfileFormSchema = z
  .object({
    connectionId: z.string().regex(/^\d+$/),
    decision: z.discriminatedUnion("type", [
      z
        .object({
          instructions: text,
          options: z
            .array(z.object({ description, value: key }).strict())
            .min(2)
            .max(24),
          type: z.literal("choice"),
        })
        .strict(),
      z
        .object({
          instructions: text,
          levels: z.array(z.object({ description }).strict()).min(2).max(10),
          type: z.literal("score"),
        })
        .strict(),
      z
        .object({
          falseCriteria: text,
          instructions: text,
          trueCriteria: text,
          type: z.literal("noul"),
        })
        .strict(),
    ]),
    description: z.string().trim().max(2000).nullable().optional(),
    model: z.string().trim().min(1).max(256),
    name: z.string().trim().min(1).max(160),
    status: z.enum(["enabled", "disabled"]),
    thresholdConfig: z
      .discriminatedUnion("type", [
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
      ])
      .nullable(),
  })
  .strict()

export type DecisionProfileForm = z.infer<typeof decisionProfileFormSchema>

export const decisionProfileStoredContractSchema = z
  .object({
    inputs: z
      .array(
        z
          .object({
            key: z.literal("currentMessage"),
            required: z.literal(true),
          })
          .strict(),
      )
      .length(1),
    questions: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              instructions: text,
              key: z.literal("result"),
              label: z.string(),
              options: z.array(
                z
                  .object({ description, label: z.string(), value: key })
                  .strict(),
              ),
              type: z.literal("choice"),
            })
            .strict(),
          z
            .object({
              instructions: text,
              key: z.literal("result"),
              label: z.string(),
              levels: z.array(
                z
                  .object({ description, label: z.string(), value: z.number() })
                  .strict(),
              ),
              type: z.literal("score"),
            })
            .strict(),
          z
            .object({
              falseCriteria: text,
              instructions: text,
              key: z.literal("result"),
              label: z.string(),
              trueCriteria: text,
              type: z.literal("noul"),
            })
            .strict(),
        ]),
      )
      .length(1),
  })
  .strict()
