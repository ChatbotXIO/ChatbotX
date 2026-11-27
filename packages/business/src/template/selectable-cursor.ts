import { decodeBase64UrlText, encodeBase64UrlText } from "@chatbotx.io/utils"
import { ChatbotXException } from "../errors"

/** The row a selectable-resource page ended on: its sort key and id. */
export type SelectableCursor = { key: string; id: string }

const LEGACY_OFFSET_PATTERN = /^\d+$/

/** Largest id Postgres `bigint` holds; a longer or larger cursor id would fail the query. */
const MAX_BIGINT = 9_223_372_036_854_775_807n
/** Offsets beyond this are no page a client was ever given. */
const MAX_LEGACY_OFFSET_DIGITS = 9
/** Postgres `timestamptz::text`: `2026-10-30 10:00:00.123456+00`. */
const TIMESTAMP_KEY_PATTERN =
  /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(?:([+-]\d{2})(?::?(\d{2}))?|Z)$/

const isBigintId = (value: string): boolean =>
  LEGACY_OFFSET_PATTERN.test(value) &&
  value.length <= 19 &&
  BigInt(value) <= MAX_BIGINT

/** A well-formed key the database can cast to `timestamptz`, not just one shaped like it. */
const isTimestampKey = (key: string): boolean => {
  const match = TIMESTAMP_KEY_PATTERN.exec(key)
  if (!match) {
    return false
  }
  const [, date, time, hours, minutes] = match
  const zone = hours ? `${hours}:${minutes ?? "00"}` : "Z"
  return !Number.isNaN(Date.parse(`${date}T${time}${zone}`))
}

const invalidCursorException = () =>
  new ChatbotXException("Invalid cursor", "invalidCursor", 400)

/** How the sort key a category pages by is compared: as text (names) or as a timestamp. */
export type SelectableCursorKeyKind = "text" | "timestamp"

/** Opaque, URL-safe and diacritic-safe (names are Unicode, `btoa` alone is not). */
export const encodeSelectableCursor = (cursor: SelectableCursor): string =>
  encodeBase64UrlText(JSON.stringify([cursor.key, cursor.id]))

export type DecodedSelectableCursor =
  | { kind: "first" }
  | { kind: "offset"; offset: number }
  | { kind: "after"; after: SelectableCursor }

/**
 * Cursors issued before keyset paging were plain page offsets ("100"); they
 * still resolve, so a client mid-pagination across a deploy keeps working.
 */
export const decodeSelectableCursor = (
  cursor: string | null | undefined,
  keyKind: SelectableCursorKeyKind = "text",
): DecodedSelectableCursor => {
  if (!cursor) {
    return { kind: "first" }
  }
  if (LEGACY_OFFSET_PATTERN.test(cursor)) {
    if (cursor.length > MAX_LEGACY_OFFSET_DIGITS) {
      throw invalidCursorException()
    }
    return { kind: "offset", offset: Number.parseInt(cursor, 10) }
  }
  try {
    const parsed: unknown = JSON.parse(decodeBase64UrlText(cursor))
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      isBigintId(parsed[1]) &&
      !parsed[0].includes("\u0000") &&
      (keyKind === "text" || isTimestampKey(parsed[0]))
    ) {
      return { kind: "after", after: { key: parsed[0], id: parsed[1] } }
    }
  } catch {
    // fall through to the invalid-cursor error
  }
  throw invalidCursorException()
}
