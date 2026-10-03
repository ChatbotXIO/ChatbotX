import { ChatbotXException } from "@chatbotx.io/business/errors"

/** Whether `error` is the shared CAPI operations' "channel not found". */
export const isNotFound = (error: unknown): boolean =>
  error instanceof ChatbotXException && error.code === "notFound"
