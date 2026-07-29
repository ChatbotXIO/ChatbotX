import { facebookLeadFieldMappingSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const nullableFlowId = z
  .union([z.literal("").transform(() => null), zodBigintAsString()])
  .nullable()
  .optional()

export const createFacebookLeadAdAutomationRequest = z.object({
  name: z.string().min(1).max(100),
  pageId: z.string().min(1),
  pageName: z.string().nullable().optional(),
  // "*" (ALL_FORMS_ID) means every lead form on the page.
  formId: z.string().min(1),
  formName: z.string().nullable().optional(),
  fieldMapping: z.array(facebookLeadFieldMappingSchema).default([]),
  flowId: nullableFlowId,
})
export type CreateFacebookLeadAdAutomationRequest = z.infer<
  typeof createFacebookLeadAdAutomationRequest
>

export const updateFacebookLeadAdAutomationRequest = z.object({
  name: z.string().min(1).max(100).optional(),
  fieldMapping: z.array(facebookLeadFieldMappingSchema).optional(),
  flowId: nullableFlowId,
})
export type UpdateFacebookLeadAdAutomationRequest = z.infer<
  typeof updateFacebookLeadAdAutomationRequest
>
