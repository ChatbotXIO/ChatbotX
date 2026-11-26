import type { z } from "zod"
import { ChannelError } from "./channel-error"
import { ChannelErrorCategory } from "./channel-error-codes"

/**
 * Opaque cursor of a multi-step comment traversal (top-level page, then the
 * replies of one comment, then the next top-level page): the position is
 * base64url JSON (no `Buffer`: the builder's router graph reaches this module, invariant 25), so a caller can only hand it back, never build one.
 */
export const encodePostCommentCursor = (position: unknown): string =>
  btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(position))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")

/** Throws on anything that is not base64url of valid UTF-8. */
const decodeBase64Url = (text: string): string => {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
}

/**
 * Reads back a cursor this channel issued. Anything else (not base64url, not
 * JSON, not the expected shape) is a caller bug, not a channel outage, so it is
 * a permanent `PAYLOAD_INVALID` rather than a retried error.
 */
export const decodePostCommentCursor = <TSchema extends z.ZodType>(
  cursor: string,
  schema: TSchema,
): z.infer<TSchema> => {
  const invalid = () =>
    new ChannelError(
      "Invalid comment cursor",
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeBase64Url(cursor))
  } catch {
    throw invalid()
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw invalid()
  }
  return result.data
}
