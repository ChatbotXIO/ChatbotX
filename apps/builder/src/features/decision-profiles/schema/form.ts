import { z } from "zod"

export {
  type DecisionProfileForm,
  decisionProfileFormSchema,
} from "@chatbotx.io/decision-config"

const key = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/)
const text = z.string().trim().min(1).max(1000)
const description = z.string().trim().min(1).max(400)

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
