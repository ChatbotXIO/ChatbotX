import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
import { z } from "zod"

export type IntegrationWhatsappResource = IntegrationWhatsappModel

export const connectWhatsappSchema = z
  .object({
    businessId: z.string().min(1),
    wabaId: z.string().min(1),
    connectExisting: z.boolean(),
    transferPhoneNumber: z.boolean(),
    manualConnect: z.boolean(),
    marketingMessageLite: z.boolean(),
    phoneNumberId: z.string().min(1),
    chatbotId: z.string().nullish(),
    accessToken: z.string().nullish(),
    code: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    if (!(data.accessToken || data.code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required access token or code",
      })
    }
  })
export type ConnectWhatsappSchema = z.infer<typeof connectWhatsappSchema>

export const listPhoneNumbersRequest = z.object({
  wabaId: z.string(),
  accessToken: z.string(),
})
export type ListPhoneNumbersRequest = z.infer<typeof listPhoneNumbersRequest>
