import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional()

export const getResponseAddContactSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.getResponseAddContact)
      .describe('Step type discriminator: "getResponseAddContact".'),
    campaignId: z.string().trim().min(1),
    emailField: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)).optional(),
    dayOfCycle: optionalTrimmedString,
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine((value, ctx) => {
    const tagIds = new Set<string>()
    value.tags?.forEach((tagId, index) => {
      if (tagIds.has(tagId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate GetResponse tag: "${tagId}"`,
          path: ["tags", index],
        })
      }
      tagIds.add(tagId)
    })
  })

export type GetResponseAddContactSchema = z.infer<
  typeof getResponseAddContactSchema
>

export const getResponseAddContactDefaultFn =
  (): GetResponseAddContactSchema => ({
    id: createId(),
    stepType: stepTypes.enum.getResponseAddContact,
    campaignId: "",
    emailField: "email",
    tags: [],
    dayOfCycle: undefined,
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
