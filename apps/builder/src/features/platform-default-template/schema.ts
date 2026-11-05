import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { shareTokenSchema } from "@/features/templates/schema/shared"

export const updateDefaultTemplateSchema = z.object({
  templateId: zodBigintAsString(),
  templateKey: shareTokenSchema,
})

export type UpdateDefaultTemplateSchema = z.infer<
  typeof updateDefaultTemplateSchema
>

/** Why a save was refused; each maps to `platformDefaultTemplate.errors.<reason>`. */
export type DefaultTemplateRejectionReason = "unavailable" | "shareDisabled"

export type SaveDefaultTemplateOutcome =
  | { status: "saved" }
  | { status: "rejected"; reason: DefaultTemplateRejectionReason }
