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

/**
 * Per-number FreeSWITCH SIP provisioning state machine (WhatsApp calling on
 * FreeSWITCH): `none` → `provisioning` (lease claimed) →
 * `provisioned` (Meta SIP credentials stored, gateway created) → `enabled`
 * (Meta `sip.status: ENABLED` written back) or `failed`. The allowed
 * transitions themselves (`SIP_PROVISIONING_TRANSITIONS`) live in
 * `packages/business` — this enum only fixes the value set the column can
 * hold.
 */
export const sipProvisioningStatuses = z.enum([
  "none",
  "provisioning",
  "provisioned",
  "enabled",
  "failed",
])
export type SipProvisioningStatus = z.infer<typeof sipProvisioningStatuses>
