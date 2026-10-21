import "server-only"

import type { MmDeliveryErrorCode } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"

type Translate = Awaited<ReturnType<typeof getTranslations>>

/**
 * Explicit `t` calls per code keep next-intl's typed keys checkable. The
 * `satisfies` makes a code added to `mmDeliveryErrorCodes` a compile error
 * here until it has a message.
 */
const buildMessages = (t: Translate) =>
  ({
    mmNotFound: () => t("facebookMarketingMessages.errors.notFound"),
    mmInvalidState: () => t("facebookMarketingMessages.errors.mmInvalidState"),
    mmCampaignEnded: () =>
      t("facebookMarketingMessages.errors.mmCampaignEnded"),
    mmGrantInvalid: () => t("facebookMarketingMessages.errors.connectFirst"),
    mmPageNotConnected: () =>
      t("facebookMarketingMessages.errors.mmPageNotConnected"),
    mmContentLocked: () =>
      t("facebookMarketingMessages.errors.mmContentLocked"),
  }) satisfies Record<MmDeliveryErrorCode, () => string>

/**
 * The delivery service throws coded exceptions whose `message` is the code
 * itself. Re-throw them with a translated message, keeping the code so a
 * public API caller can still branch on it.
 */
export async function withMmDeliveryErrors<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (!(error instanceof ChatbotXException)) {
      throw error
    }
    const messages: Record<string, (() => string) | undefined> = buildMessages(
      await getTranslations(),
    )
    const message = messages[error.code]
    if (!message) {
      throw error
    }
    throw new ChatbotXException(
      message(),
      error.code,
      error.code === "mmNotFound" ? 404 : error.httpStatusCode,
    )
  }
}
