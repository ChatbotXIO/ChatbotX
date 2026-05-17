import type {
  InboxModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"
import { z } from "zod"

export type IntegrationWhatsappResource = IntegrationWhatsappModel & {
  inbox?: Pick<InboxModel, "id" | "name">
}

export type ManualOnboardingResult = {
  integrationId: string
  workspaceId: string
  webhookUrl: string
  verifyToken: string
}

export type ConnectWhatsappResult =
  | { type: "redirect"; redirectUrl: string }
  | { type: "manualResult"; data: ManualOnboardingResult }

export const connectWhatsappSchema = z
  .object({
    businessId: z.string().nullish(),
    wabaId: z.string().min(1),
    connectExisting: z.boolean(),
    transferPhoneNumber: z.boolean(),
    manualConnect: z.boolean(),
    marketingMessageLite: z.boolean(),
    phoneNumberId: z.string().min(1),
    workspaceId: z.string().nullish(),
    accessToken: z.string().nullish(),
    code: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    if (!(data.manualConnect || data.businessId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required business id",
        path: ["businessId"],
      })
    }

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
