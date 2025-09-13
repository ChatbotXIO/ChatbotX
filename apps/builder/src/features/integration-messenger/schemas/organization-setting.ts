import { z } from "zod"

export const validateOrganizationSettingSchema = z.object({
  messengerClientId: z.string(),
  messengerClientSecret: z.string(),
  messengerVersion: z.string(),
  messengerVerifyToken: z.string(),
})
export type ValidateOrganizationSetting = z.infer<
  typeof validateOrganizationSettingSchema
>
