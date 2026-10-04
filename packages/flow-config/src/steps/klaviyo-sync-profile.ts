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

export const klaviyoPropertyMappingSchema = z.object({
  contactFieldId: z.string().trim().min(1),
  klaviyoProperty: z.string().trim().min(1),
})

export const klaviyoSyncProfileSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.klaviyoSyncProfile)
      .describe('Step type discriminator: "klaviyoSyncProfile".'),
    listId: optionalTrimmedString,
    emailField: z.string().trim().min(1),
    titleField: optionalTrimmedString,
    orgField: optionalTrimmedString,
    mergeFields: z.array(klaviyoPropertyMappingSchema),
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine((value, ctx) => {
    const properties = new Set<string>()
    value.mergeFields.forEach((mapping, index) => {
      if (properties.has(mapping.klaviyoProperty)) {
        ctx.addIssue({
          code: "custom",
          path: ["mergeFields", index, "klaviyoProperty"],
          message: "Klaviyo property mappings must be unique",
        })
      }
      properties.add(mapping.klaviyoProperty)
    })
  })

export type KlaviyoSyncProfileSchema = z.infer<typeof klaviyoSyncProfileSchema>

export const klaviyoSyncProfileDefaultFn = (): KlaviyoSyncProfileSchema => ({
  id: createId(),
  stepType: stepTypes.enum.klaviyoSyncProfile,
  emailField: "email",
  mergeFields: [],
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
