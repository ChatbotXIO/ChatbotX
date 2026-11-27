import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { TemplateStoreOutcome, TemplateStoreRejection } from "./schema"

/**
 * The expected refusals, by business error code. The safe-action client would
 * return the exception's English message verbatim, so these are answered as a
 * typed outcome and translated in the UI instead.
 */
const REJECTION_BY_CODE: Partial<Record<string, TemplateStoreRejection>> = {
  templateStoreTemplateUnavailable: "templateUnavailable",
  templateStoreListingExists: "listingExists",
  templateStoreListingUnavailable: "listingUnavailable",
  templateStoreListingLimit: "listingLimit",
  templateStoreCategoryUnavailable: "categoryUnavailable",
  templateStoreCategoryNameTaken: "categoryNameTaken",
  templateStoreCategoryLimit: "categoryLimit",
}

/** Runs a store mutation; an expected refusal becomes an outcome, anything else still throws. */
export const runTemplateStoreMutation = async (
  mutation: () => Promise<void>,
): Promise<TemplateStoreOutcome> => {
  try {
    await mutation()
    return { status: "done" }
  } catch (error) {
    const reason =
      error instanceof ChatbotXException
        ? REJECTION_BY_CODE[error.code]
        : undefined
    if (!reason) {
      throw error
    }
    return { status: "rejected", reason }
  }
}
