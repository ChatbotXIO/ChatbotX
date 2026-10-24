import "server-only"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type AudienceErrorCode,
  type AudienceUploadResult,
  isAudienceError,
} from "@chatbotx.io/business/facebook-marketing-message-audience"
import { getTranslations } from "next-intl/server"
import type { UploadOutcome } from "./audience-upload"

/**
 * Service errors carry a code + numeric data; re-throw them as translated
 * messages the action client surfaces as `serverError`. Explicit `t` calls
 * per code keep next-intl's typed keys checkable.
 */
export async function withAudienceErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (!isAudienceError(error)) {
      throw error
    }
    throw new ChatbotXException(await translateAudienceError(error))
  }
}

/**
 * Upload actions return a structured outcome instead of throwing, so the
 * client can tell "nothing was created" (`invalid`) and "an audience may
 * exist" (`partial`) apart from any thrown error, which it must treat as
 * uncertain. Non-audience errors still throw.
 */
export async function toUploadOutcome(
  fn: () => Promise<AudienceUploadResult>,
): Promise<UploadOutcome> {
  try {
    return { status: "ok", ...(await fn()) }
  } catch (error) {
    if (!isAudienceError(error)) {
      throw error
    }
    const message = await translateAudienceError(error)
    if (error.code === "audiencePartialUpload") {
      return {
        status: "partial",
        received: Number(error.data?.received ?? 0),
        message,
      }
    }
    return { status: "invalid", message }
  }
}

async function translateAudienceError(
  error: ChatbotXException & { code: AudienceErrorCode },
): Promise<string> {
  const t = await getTranslations()
  const data = error.data ?? {}
  const messages = {
    audienceInvalidFile: () =>
      t("facebookMarketingMessages.audiences.errors.audienceInvalidFile"),
    audienceTooManyRows: () =>
      t("facebookMarketingMessages.audiences.errors.audienceTooManyRows", {
        max: Number(data.max ?? 0),
      }),
    audienceNoIdentifier: () =>
      t("facebookMarketingMessages.audiences.errors.audienceNoIdentifier"),
    audienceNoValidRows: () =>
      t("facebookMarketingMessages.audiences.errors.audienceNoValidRows"),
    audiencePartialUpload: () =>
      t("facebookMarketingMessages.audiences.errors.audiencePartialUpload", {
        received: Number(data.received ?? 0),
      }),
    audienceCreateRejected: () =>
      t("facebookMarketingMessages.audiences.errors.audienceCreateRejected", {
        reason: String(data.reason ?? ""),
      }),
    audienceNotFound: () =>
      t("facebookMarketingMessages.audiences.errors.audienceNotFound"),
    audienceInUse: () =>
      t("facebookMarketingMessages.audiences.errors.audienceInUse", {
        count: Number(data.count ?? 0),
      }),
  } satisfies Record<typeof error.code, () => string>
  return messages[error.code]()
}
