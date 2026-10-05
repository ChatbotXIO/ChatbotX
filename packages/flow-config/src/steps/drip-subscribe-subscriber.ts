import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const dripMergeFieldMappingSchema = z.object({
  contactFieldId: z.string().trim().min(1),
  dripField: z.string().trim().min(1),
})

export const dripSubscribeSubscriberSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.dripSubscribeSubscriber)
      .describe('Step type discriminator: "dripSubscribeSubscriber".'),
    accountId: z.string().trim().min(1),
    emailField: z.string().trim().min(1),
    phoneField: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)),
    mergeFields: z.array(dripMergeFieldMappingSchema),
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>()
    for (let i = 0; i < data.mergeFields.length; i++) {
      const { dripField } = data.mergeFields[i]
      if (seen.has(dripField)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate Drip field mapping: "${dripField}"`,
          path: ["mergeFields", i, "dripField"],
        })
      }
      seen.add(dripField)
    }
    const tagsSeen = new Set<string>()
    for (let i = 0; i < data.tags.length; i++) {
      if (tagsSeen.has(data.tags[i])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate tag: "${data.tags[i]}"`,
          path: ["tags", i],
        })
      }
      tagsSeen.add(data.tags[i])
    }
  })

export type DripSubscribeSubscriberSchema = z.infer<
  typeof dripSubscribeSubscriberSchema
>

export const dripSubscribeSubscriberDefaultFn =
  (): DripSubscribeSubscriberSchema => ({
    id: createId(),
    stepType: stepTypes.enum.dripSubscribeSubscriber,
    accountId: "",
    emailField: "email",
    phoneField: undefined,
    tags: [],
    mergeFields: [],
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
