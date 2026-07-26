import { z } from "zod"

export const whatsappTemplateStatusSchema = z.enum([
  "APPROVED",
  "PENDING",
  "REJECTED",
])
export type WhatsappTemplateStatus = z.infer<
  typeof whatsappTemplateStatusSchema
>

export const whatsappTemplateCategories = z.enum(["MARKETING", "UTILITY"])
export type WhatsappTemplateCategory = z.infer<
  typeof whatsappTemplateCategories
>

export const whatsappRegistrationStatuses = z.enum([
  "pending_verification",
  "registered",
  "failed",
])
export type WhatsappRegistrationStatus = z.infer<
  typeof whatsappRegistrationStatuses
>
