import { ChatbotXException } from "@chatbotx.io/business/errors"

/**
 * Years a cursor time may carry. JS dates reach years Postgres cannot take:
 * before 4713 BC it cannot store them, and past 9999 `toISOString()` writes
 * `+010000-…`, whose `+` Postgres reads as a time zone. Nothing the app stores
 * is dated outside this range.
 */
const MIN_CURSOR_YEAR = 1
const MAX_CURSOR_YEAR = 9999

/** Whether a time decoded from a cursor is safe to send into a SQL compare. */
export const isCursorTimeInRange = (time: Date): boolean => {
  const year = time.getUTCFullYear()
  return year >= MIN_CURSOR_YEAR && year <= MAX_CURSOR_YEAR
}

/** A cursor that is malformed or out of range: restarting at page 1 would repeat rows for a client appending pages. */
export const invalidCursorException = (): ChatbotXException =>
  new ChatbotXException(
    "The cursor is invalid. Start again without a cursor.",
    "invalidCursor",
    400,
  )
