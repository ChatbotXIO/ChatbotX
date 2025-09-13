import { z } from "zod"

export const validateWhatsappSettingSchema = z.object({
  whatsappClientId: z.string(),
  whatsappClientSecret: z.string(),
  whatsappVersion: z.string(),
  whatsappVerifyToken: z.string(),
})
export type ValidateWhatsappSetting = z.infer<
  typeof validateWhatsappSettingSchema
>
