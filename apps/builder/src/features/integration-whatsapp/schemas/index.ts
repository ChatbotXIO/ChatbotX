import { z } from "zod"

export type ManualOnboardingResult = {
  integrationId: string
  workspaceId: string
  webhookUrl: string
  verifyToken: string
}

export type ConnectWhatsappResult =
  | {
      type: "redirect"
      redirectUrl: string
      integrationId: string
      workspaceId: string
      isCoexist: boolean
    }
  | { type: "manualResult"; data: ManualOnboardingResult }

export const connectWhatsappSchema = z
  .object({
    businessId: z.string().nullish(),
    // Optional for the OAuth dialog flow: only a `code` comes back and the
    // server derives wabaId/phoneNumberId/businessId from the token. Manual
    // connect supplies them directly (enforced below).
    wabaId: z.string().nullish(),
    connectExisting: z.boolean(),
    transferPhoneNumber: z.boolean(),
    manualConnect: z.boolean(),
    marketingMessageLite: z.boolean(),
    phoneNumberId: z.string().nullish(),
    workspaceId: z.string().nullish(),
    accessToken: z.string().nullish(),
    code: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.manualConnect) {
      if (!data.wabaId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required waba id",
          path: ["wabaId"],
        })
      }
      if (!data.phoneNumberId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required phone number id",
          path: ["phoneNumberId"],
        })
      }
      if (!data.accessToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required access token",
          path: ["accessToken"],
        })
      }
      return
    }

    // OAuth dialog flow: the `code` is the only required input.
    if (!data.code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required code",
        path: ["code"],
      })
    }
  })
export type ConnectWhatsappSchema = z.infer<typeof connectWhatsappSchema>

export const listPhoneNumbersRequest = z.object({
  wabaId: z.string(),
  accessToken: z.string(),
})
export type ListPhoneNumbersRequest = z.infer<typeof listPhoneNumbersRequest>
