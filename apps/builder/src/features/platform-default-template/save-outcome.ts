import {
  type DefaultTemplateScope,
  tenantDefaultTemplateService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type {
  DefaultTemplateRejectionReason,
  SaveDefaultTemplateOutcome,
  UpdateDefaultTemplateSchema,
} from "./schema"

/**
 * The expected refusals, by business error code. The safe-action client would
 * return the exception's English message verbatim, so these two are answered
 * as typed outcomes and translated in the form instead.
 */
const REJECTION_BY_CODE: Partial<
  Record<string, DefaultTemplateRejectionReason>
> = {
  tenantDefaultTemplateUnavailable: "unavailable",
  tenantDefaultTemplateShareDisabled: "shareDisabled",
}

/** Saves the default and turns the two expected refusals into an outcome; anything else still throws. */
export const saveDefaultTemplate = async (
  scope: DefaultTemplateScope,
  input: UpdateDefaultTemplateSchema,
  actorUserId: string,
): Promise<SaveDefaultTemplateOutcome> => {
  try {
    await tenantDefaultTemplateService.set({ scope, ...input, actorUserId })
    return { status: "saved" }
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
