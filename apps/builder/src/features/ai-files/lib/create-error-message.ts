import {
  type AIFileCreateErrorReason,
  AIFileCreateException,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { AI_FILE_MAX_UPLOAD_BYTES } from "@chatbotx.io/sdk"
import { formatBytes } from "@chatbotx.io/ui/lib/number-format"
import { getTranslations } from "next-intl/server"

const createErrorKey = {
  invalidUrl: "aiFiles.create.errors.invalidUrl",
  urlNotAllowed: "aiFiles.create.errors.urlNotAllowed",
  googleFileNotPublic: "aiFiles.create.errors.googleFileNotPublic",
  googlePublishedNotSupported:
    "aiFiles.create.errors.googlePublishedNotSupported",
  unsupportedFileType: "aiFiles.create.errors.unsupportedFileType",
  fileTooLarge: "aiFiles.create.errors.fileTooLarge",
  downloadTimedOut: "aiFiles.create.errors.downloadTimedOut",
  downloadFailed: "aiFiles.create.errors.downloadFailed",
  tooManyRedirects: "aiFiles.create.errors.tooManyRedirects",
  invalidRedirect: "aiFiles.create.errors.invalidRedirect",
  uploadPathNotAllowed: "aiFiles.create.errors.uploadPathNotAllowed",
} as const satisfies Record<AIFileCreateErrorReason, string>

/**
 * What a create server action throws for an `aiFileService.create` failure:
 * a translated copy of a missing embedding provider or a known create refusal
 * (same code and status), otherwise the error unchanged. Server-only.
 */
export async function toAIFileCreateActionError(
  error: unknown,
): Promise<unknown> {
  if (!(error instanceof ChatbotXException)) {
    return error
  }
  const t = await getTranslations()
  if (error.code === "noEmbeddingProvider") {
    return new ChatbotXException(t("aiFiles.noEmbeddingProvider"))
  }
  if (!(error instanceof AIFileCreateException)) {
    return error
  }
  // Runtime guard: a reason this build has no key for keeps its English message.
  const key = createErrorKey[error.reason] as string | undefined
  if (!key) {
    return error
  }
  const message =
    error.reason === "fileTooLarge"
      ? t(key, {
          maxSize: formatBytes(error.maxBytes ?? AI_FILE_MAX_UPLOAD_BYTES, 0),
        })
      : t(key)
  return new ChatbotXException(message, error.code, error.httpStatusCode)
}
