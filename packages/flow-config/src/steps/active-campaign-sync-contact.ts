import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const activeCampaignFieldValueMappingSchema = z.object({
  contactFieldId: z.string().trim().min(1),
  activeCampaignFieldId: z.string().trim().min(1),
})

export const activeCampaignOperationTypes = z.enum([
  "createOrUpdateContact",
  "addContactToAutomation",
])
export type ActiveCampaignOperationType = z.infer<
  typeof activeCampaignOperationTypes
>

export const activeCampaignSyncContactSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.activeCampaignSyncContact)
      .describe('Step type discriminator: "activeCampaignSyncContact".'),
    operation: activeCampaignOperationTypes.default("createOrUpdateContact"),
    emailField: z.string().trim().min(1),
    phoneField: z.string().trim().min(1).optional(),
    automationId: z.string().trim().min(1).optional(),
    listIds: z.array(z.string().trim().min(1)),
    tagIds: z.array(z.string().trim().min(1)),
    fieldValues: z.array(activeCampaignFieldValueMappingSchema),
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine((data, ctx) => {
    if (
      data.operation === "addContactToAutomation" &&
      !data.automationId?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ActiveCampaign automation is required",
        path: ["automationId"],
      })
    }
    if (data.operation === "addContactToAutomation") {
      return
    }

    const listIds = new Set<string>()
    for (let i = 0; i < data.listIds.length; i++) {
      if (listIds.has(data.listIds[i])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ActiveCampaign list: "${data.listIds[i]}"`,
          path: ["listIds", i],
        })
      }
      listIds.add(data.listIds[i])
    }

    const tagIds = new Set<string>()
    for (let i = 0; i < data.tagIds.length; i++) {
      if (tagIds.has(data.tagIds[i])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ActiveCampaign tag: "${data.tagIds[i]}"`,
          path: ["tagIds", i],
        })
      }
      tagIds.add(data.tagIds[i])
    }

    const fieldIds = new Set<string>()
    for (let i = 0; i < data.fieldValues.length; i++) {
      const fieldId = data.fieldValues[i].activeCampaignFieldId
      if (fieldIds.has(fieldId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ActiveCampaign field mapping: "${fieldId}"`,
          path: ["fieldValues", i, "activeCampaignFieldId"],
        })
      }
      fieldIds.add(fieldId)
    }
  })

export type ActiveCampaignSyncContactSchema = z.infer<
  typeof activeCampaignSyncContactSchema
>

export const activeCampaignSyncContactDefaultFn =
  (): ActiveCampaignSyncContactSchema => ({
    id: createId(),
    stepType: stepTypes.enum.activeCampaignSyncContact,
    operation: "createOrUpdateContact",
    emailField: "email",
    phoneField: undefined,
    automationId: undefined,
    listIds: [],
    tagIds: [],
    fieldValues: [],
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
