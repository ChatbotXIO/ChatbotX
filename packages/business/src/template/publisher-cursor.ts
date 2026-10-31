import { decodeBase64UrlText, encodeBase64UrlText } from "@chatbotx.io/utils"
import { ChatbotXException } from "../errors"

export const PUBLISHER_PAGE_SIZE = 25

/** The cursor carries a timestamp and the opaque ref, never a row id. */
export const encodePublisherCursor = (
  lastInstalledAt: Date,
  publisherRef: string,
): string =>
  encodeBase64UrlText(`${lastInstalledAt.toISOString()}|${publisherRef}`)

const decodeCursorText = (cursor: string): string => {
  try {
    return decodeBase64UrlText(cursor)
  } catch {
    return ""
  }
}

const PUBLISHER_REF_PATTERN = /^[0-9a-f]{16,64}$/

export const decodePublisherCursor = (
  cursor: string | undefined,
): { lastInstalledAt: Date; publisherRef: string } | undefined => {
  if (!cursor) {
    return
  }
  const [iso, publisherRef] = decodeCursorText(cursor).split("|")
  const lastInstalledAt = new Date(iso ?? "")
  if (
    !publisherRef ||
    Number.isNaN(lastInstalledAt.getTime()) ||
    !PUBLISHER_REF_PATTERN.test(publisherRef)
  ) {
    throw new ChatbotXException("Invalid cursor", "invalidCursor", 400)
  }
  return { lastInstalledAt, publisherRef }
}
