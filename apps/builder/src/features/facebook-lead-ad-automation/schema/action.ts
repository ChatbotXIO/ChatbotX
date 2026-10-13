import { facebookLeadFieldMappingSchema } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const createFacebookLeadAdAutomationRequest = z.object({
  name: z.string().min(1).max(100).describe("Automation name."),
  pageId: z
    .string()
    .min(1)
    .describe("Facebook page id. Get it from `facebookLeadAds.listPages`."),
  pageName: z
    .string()
    .nullable()
    .optional()
    .describe("Display name of the page."),
  // "*" (ALL_FORMS_ID) means every lead form on the page.
  formId: z
    .string()
    .min(1)
    .describe(
      'Lead form id, or "*" for every form on the page. Get it from `facebookLeadAds.listForms`.',
    ),
  formName: z
    .string()
    .nullable()
    .optional()
    .describe("Display name of the lead form."),
  fieldMapping: z
    .array(facebookLeadFieldMappingSchema)
    .default([])
    .describe("Mappings from lead form fields to contact/custom fields."),
})
export type CreateFacebookLeadAdAutomationRequest = z.infer<
  typeof createFacebookLeadAdAutomationRequest
>

export const updateFacebookLeadAdAutomationRequest = z.object({
  name: z.string().min(1).max(100).optional().describe("New automation name."),
  fieldMapping: z
    .array(facebookLeadFieldMappingSchema)
    .optional()
    .describe("Mappings from lead form fields to contact/custom fields."),
})
export type UpdateFacebookLeadAdAutomationRequest = z.infer<
  typeof updateFacebookLeadAdAutomationRequest
>
