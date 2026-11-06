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
