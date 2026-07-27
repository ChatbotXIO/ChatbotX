import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const WHATSAPP_VERIFICATION_COOLDOWN_SECONDS = 60

export const whatsappVerificationCodeMethods = z.enum(["SMS", "VOICE"])
export type WhatsappVerificationCodeMethod = z.infer<
  typeof whatsappVerificationCodeMethods
>

export const requestWhatsappVerificationCodeSchema = z.object({
  integrationId: zodBigintAsString(),
  codeMethod: whatsappVerificationCodeMethods,
})
export type RequestWhatsappVerificationCodeSchema = z.infer<
  typeof requestWhatsappVerificationCodeSchema
>

export const verifyWhatsappPhoneCodeSchema = z.object({
  integrationId: zodBigintAsString(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
})
export type VerifyWhatsappPhoneCodeSchema = z.infer<
  typeof verifyWhatsappPhoneCodeSchema
>

export type WhatsappVerificationRequestResult =
  | { status: "sent"; requestedAt: string }
  | {
      status: "cooldown"
      requestedAt: string | null
      remainingSeconds: number
    }
