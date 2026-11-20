import { ChatbotXException } from "../errors"

export const MAX_PAYLOAD_RESOURCES = 200
// `payload` is a jsonb column, not S3 — a row-count cap alone doesn't bound
// bytes (e.g. 200 large flow graphs), so this is a second, independent gate.
export const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024

export const templateSaveValidationException = () =>
  new ChatbotXException(
    "One or more selected resources could not be found in this workspace",
    "templateSaveInvalidSelection",
  )

export const templatePayloadTooLargeException = () =>
  new ChatbotXException(
    "This template selection is too large to save",
    "templatePayloadTooLarge",
  )

export const templatePayloadTooManyBytesException = () =>
  new ChatbotXException(
    "This template's data is too large to save",
    "templatePayloadTooManyBytes",
  )

const encodedBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength

/**
 * The "too many bytes" error, naming the cause when Mini Apps are it: a Mini
 * App embeds its images as base64 inside its definition, so a few of them can
 * fill the cap alone. Blamed when they alone exceed it or make up more than
 * half of the payload.
 */
export const payloadTooManyBytesExceptionFor = (
  resources: Record<string, unknown>,
  totalBytes: number,
): ChatbotXException => {
  const miniAppBytes =
    resources.miniApps === undefined ? 0 : encodedBytes(resources.miniApps)
  if (miniAppBytes > MAX_PAYLOAD_BYTES || miniAppBytes * 2 > totalBytes) {
    return new ChatbotXException(
      "This template's Mini Apps are too large to save: their embedded images take most of the space. Replace the images with smaller ones or remove some Mini Apps",
      "templatePayloadTooManyBytesMiniApps",
    )
  }
  return templatePayloadTooManyBytesException()
}
