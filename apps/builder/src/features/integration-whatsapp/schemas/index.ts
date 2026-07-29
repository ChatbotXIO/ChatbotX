import type { IntegrationWhatsappRegistrationError } from "@chatbotx.io/database/schema"
import { z } from "zod"

export type ManualOnboardingResult = {
  integrationId: string
  workspaceId: string
  webhookUrl: string
  verifyToken: string
}

export type WhatsappPhoneNumberOption = {
  id: string
  label: string
  displayPhoneNumber: string
}

export const CONNECT_WHATSAPP_RESULT_TYPES = {
  REDIRECT: "redirect",
  MANUAL_RESULT: "manualResult",
  PHONE_NUMBER_SELECTION: "phoneNumberSelection",
  NO_PHONE_NUMBER_CANDIDATES: "noPhoneNumberCandidates",
  PHONE_NUMBERS_ALREADY_CONNECTED: "phoneNumbersAlreadyConnected",
  PHONE_NUMBER_VERIFICATION_REQUIRED: "phoneNumberVerificationRequired",
} as const

export type ConnectWhatsappResult =
  | {
      type: typeof CONNECT_WHATSAPP_RESULT_TYPES.REDIRECT
      redirectUrl: string
      integrationId: string
      workspaceId: string
      isCoexist: boolean
    }
  | {
      type: typeof CONNECT_WHATSAPP_RESULT_TYPES.MANUAL_RESULT
      data: ManualOnboardingResult
    }
  | {
      type: typeof CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBER_SELECTION
      signupSessionId: string
      phoneNumbers: WhatsappPhoneNumberOption[]
    }
  | {
      type: typeof CONNECT_WHATSAPP_RESULT_TYPES.NO_PHONE_NUMBER_CANDIDATES
    }
  | {
      type: typeof CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBERS_ALREADY_CONNECTED
    }
  | {
      type: typeof CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBER_VERIFICATION_REQUIRED
      redirectUrl: string
      integrationId: string
      workspaceId: string
      displayPhoneNumber: string
      verifiedName: string
      registrationError: IntegrationWhatsappRegistrationError | null
    }

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
    signupSessionId: z.string().nullish(),
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

    if (data.signupSessionId) {
      if (!data.phoneNumberId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required phone number id",
          path: ["phoneNumberId"],
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
