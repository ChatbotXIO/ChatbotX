import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
import { z } from "zod"

export type IntegrationWhatsappResource = IntegrationWhatsappModel

export const connectWhatsappSchema = z.object({
  wabaId: z.string(),
  accessToken: z.string(),
})
export type ConnectWhatsappSchema = z.infer<typeof connectWhatsappSchema>

export const listPhoneNumbersRequest = z.object({
  wabaId: z.string(),
  accessToken: z.string(),
})
export type ListPhoneNumbersRequest = z.infer<typeof listPhoneNumbersRequest>

export const validateWhatsappSettingSchema = z.object({
  whatsappClientId: z.string(),
  whatsappClientSecret: z.string(),
  whatsappVersion: z.string(),
  whatsappVerifyToken: z.string(),
})
export type ValidateWhatsappSetting = z.infer<
  typeof validateWhatsappSettingSchema
>
