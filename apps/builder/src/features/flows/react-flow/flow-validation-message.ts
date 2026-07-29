import { flowValidationCodes } from "@chatbotx.io/flow-config"
import type { ZodError } from "zod"

const flowValidationMessageKeys = {
  [flowValidationCodes.whatsappCarouselButtonsMismatch]:
    "messages.whatsappCarouselButtonsMismatch",
} as const

type FlowValidationCode = keyof typeof flowValidationMessageKeys
export type FlowValidationMessageKey =
  (typeof flowValidationMessageKeys)[FlowValidationCode]

const isFlowValidationCode = (message: string): message is FlowValidationCode =>
  Object.hasOwn(flowValidationMessageKeys, message)

export const resolveFlowValidationMessageKey = (
  error: ZodError,
): FlowValidationMessageKey | "messages.flowConfigIncomplete" => {
  const validationCode = error.issues.find((issue) =>
    isFlowValidationCode(issue.message),
  )?.message

  return validationCode && isFlowValidationCode(validationCode)
    ? flowValidationMessageKeys[validationCode]
    : "messages.flowConfigIncomplete"
}
