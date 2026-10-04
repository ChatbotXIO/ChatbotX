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

export const mailerLiteFieldMappingSchema = z.object({
  contactFieldId: z.string().trim().min(1),
  mailerLiteField: z.string().trim().min(1),
})

export const mailerLiteAddSubscriberSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.mailerLiteAddSubscriber)
      .describe('Step type discriminator: "mailerLiteAddSubscriber".'),
    groupId: optionalTrimmedString,
    emailField: z.string().trim().min(1),
    status: z.enum(["active", "unconfirmed"]),
    mergeFields: z.array(mailerLiteFieldMappingSchema),
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine((value, ctx) => {
    const targets = new Set<string>()
    value.mergeFields.forEach((mapping, index) => {
      if (targets.has(mapping.mailerLiteField)) {
        ctx.addIssue({
          code: "custom",
          path: ["mergeFields", index, "mailerLiteField"],
          message: "MailerLite field mappings must be unique",
        })
      }
      targets.add(mapping.mailerLiteField)
    })
  })

export type MailerLiteAddSubscriberSchema = z.infer<
  typeof mailerLiteAddSubscriberSchema
>

export const mailerLiteAddSubscriberDefaultFn =
  (): MailerLiteAddSubscriberSchema => ({
    id: createId(),
    stepType: stepTypes.enum.mailerLiteAddSubscriber,
    emailField: "email",
    status: "unconfirmed",
    mergeFields: [],
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
