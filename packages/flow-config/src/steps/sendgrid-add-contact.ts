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
  .transform((value) => value.trim() || undefined)
  .optional()

export const sendGridMergeFieldMappingSchema = z.object({
  contactFieldId: z.string().trim().min(1),
  sendGridField: z.string().trim().min(1),
})

export const sendGridAddContactSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.sendGridAddContact)
      .describe('Step type discriminator: "sendGridAddContact".'),
    listId: optionalTrimmedString,
    emailField: z.string().trim().min(1),
    phoneField: optionalTrimmedString,
    mergeFields: z.array(sendGridMergeFieldMappingSchema),
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>()
    for (let index = 0; index < data.mergeFields.length; index++) {
      const target = data.mergeFields[index].sendGridField
      if (seen.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate SendGrid field mapping: "${target}"`,
          path: ["mergeFields", index, "sendGridField"],
        })
      }
      seen.add(target)
    }
  })

export type SendGridAddContactSchema = z.infer<typeof sendGridAddContactSchema>

export const sendGridAddContactDefaultFn = (): SendGridAddContactSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendGridAddContact,
  listId: undefined,
  emailField: "email",
  phoneField: undefined,
  mergeFields: [],
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
