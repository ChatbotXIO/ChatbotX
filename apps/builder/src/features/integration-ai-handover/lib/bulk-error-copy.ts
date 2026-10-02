import { AI_HANDOVER_BULK_ERROR_CODES } from "@chatbotx.io/business"

/**
 * Service error code → i18n key, one table so the actions never branch on
 * codes by hand and a new code is a single added line.
 */
export const BULK_ERROR_COPY_KEYS: Record<string, string> = {
  [AI_HANDOVER_BULK_ERROR_CODES.automationNotActive]:
    "aiHandover.bulk.errors.automationNotActive",
  [AI_HANDOVER_BULK_ERROR_CODES.messageRequired]:
    "aiHandover.bulk.errors.messageRequired",
  [AI_HANDOVER_BULK_ERROR_CODES.messageTooLong]:
    "aiHandover.bulk.errors.messageTooLong",
  [AI_HANDOVER_BULK_ERROR_CODES.pageNotConnected]:
    "aiHandover.bulk.errors.pageNotConnected",
  [AI_HANDOVER_BULK_ERROR_CODES.nothingToRetry]:
    "aiHandover.bulk.errors.nothingToRetry",
}
