import { z } from "zod"
import type { SystemFieldType } from "./contact"

/** Sentinel `formId` meaning "every lead form on the page". */
export const ALL_FORMS_ID = "*"

/**
 * Facebook standard lead-form question key → canonical contact system field.
 * Single source shared by the create form (pre-fills a specific-form mapping)
 * and the worker (auto-maps an "all forms" automation, which has no explicit
 * mapping). Note `phone_number` → `phone`: `phone` is the canonical
 * `SystemFieldType`, and both write the same `phoneNumber` contact column.
 */
export const FB_LEAD_STANDARD_FIELD_TARGET: Record<string, SystemFieldType> = {
  email: "email",
  phone_number: "phone",
  full_name: "full_name",
  first_name: "first_name",
  last_name: "last_name",
  gender: "gender",
}

/**
 * One row per lead-form question. `target` is where the answer is written:
 * - a reserved system-field key (e.g. "email", "full_name", "phone", "gender"),
 * - a numeric custom-field id (as a string), or
 * - null (unmapped / "None").
 * Only used for specific-form automations; empty for "all forms".
 */
export const facebookLeadFieldMappingSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  target: z.string().nullable(),
})
export type FacebookLeadFieldMapping = z.infer<
  typeof facebookLeadFieldMappingSchema
>

export const facebookLeadFieldMappingsSchema = z.array(
  facebookLeadFieldMappingSchema,
)
export type FacebookLeadFieldMappings = z.infer<
  typeof facebookLeadFieldMappingsSchema
>
