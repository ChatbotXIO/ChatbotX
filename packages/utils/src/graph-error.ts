/**
 * Meta's Graph errors carry four useful pieces and every integration used to
 * throw away two of them: `code`/`error_subcode` had nowhere to go (`ErrorLog`
 * has no columns for them), and the developer-facing `message` was discarded
 * whenever `error_user_msg` was present.
 *
 * `#(10 - 1893063) Application does not have permission for this action. <the
 * sentence Meta wrote for the user>` keeps all four in the one `text` column
 * every surface already reads — the error-log table, the inbox's failed-message
 * tooltip, and the app logger.
 */

export type GraphErrorSource = {
  code?: number | string | null
  subCode?: number | string | null
  /** Graph's `error.message` — written for developers ("Invalid parameter"). */
  message?: string
  /** Graph's `error_user_msg`, or `error_user_title` when only that was sent. */
  userMessage?: string
}

/**
 * `UNKNOWN_ERROR` in `@chatbotx.io/sdk` uses -1 for "no code", and an
 * `SdkException` built without one reports -1 too. Printing `#(-1 - -1)` would
 * dress up an absent code as a real one.
 */
const UNKNOWN_CODE = -1

/**
 * Only a real number becomes part of the prefix. Codes like `"messengerError"`
 * and `"channelError"` are our own placeholders, not Meta's — they identify
 * nothing a workspace or Meta's docs can look up.
 */
const toCode = (
  value: number | string | null | undefined,
): number | undefined => {
  if (value === null || value === undefined) {
    return
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed === UNKNOWN_CODE) {
    return
  }
  return parsed
}

const codePrefix = (
  code: number | undefined,
  subCode: number | undefined,
): string => {
  if (code === undefined) {
    // No code at all — a plain thrown `Error`, a non-Meta provider. The row
    // reads exactly as it did before this format existed.
    return ""
  }
  return subCode === undefined ? `#(${code}) ` : `#(${code} - ${subCode}) `
}

/**
 * Meta already opens most Graph messages with its own `(#100) `. Ours wins —
 * it is the only one that also carries the subcode — so its copy is stripped
 * rather than printed a second time as `#(100 - 2018001) (#100) …`.
 *
 * Only an exact code match is removed: a `(#190)` sitting in front of a body we
 * read the code `100` from is Meta quoting some other failure, not a duplicate.
 */
const META_CODE_PREFIX = /^\(#(\d+)\)\s*/

const withoutMetaCodePrefix = (
  part: string | undefined,
  code: number | undefined,
): string | undefined => {
  if (part === undefined || code === undefined) {
    return part
  }
  const match = META_CODE_PREFIX.exec(part)
  if (match === null || Number(match[1]) !== code) {
    return part
  }
  // `(#100)` with nothing behind it carried no sentence; returning "" lets the
  // caller's own fallback text stand instead of a bare prefix.
  return part.slice(match[0].length)
}

/** Graph's `message` often already ends in punctuation; `action.. Bạn` is not a sentence. */
const SENTENCE_END = /[.!?…]$/

const joinSentences = (first: string, second: string): string =>
  SENTENCE_END.test(first) ? `${first} ${second}` : `${first}. ${second}`

/**
 * Composes one Graph failure into the stored/displayed string.
 *
 * Returns `undefined` when the body carried no text at all, so every caller
 * keeps its own `?? "<endpoint> failed"` fallback rather than rendering a bare
 * code prefix.
 */
export function formatGraphErrorMessage(
  source: GraphErrorSource,
): string | undefined {
  const code = toCode(source.code)
  const sentences = [source.message, source.userMessage]
    .map((part) => withoutMetaCodePrefix(part, code)?.trim())
    .filter((part): part is string => Boolean(part))

  // Graph repeats itself across the two fields often enough that printing the
  // same sentence twice would be the common case, not the edge case.
  const unique = [...new Set(sentences)]
  if (unique.length === 0) {
    return
  }

  return `${codePrefix(code, toCode(source.subCode))}${unique.reduce(joinSentences)}`
}

/** Graph's `error` object, spelled the way it arrives on the wire. */
export type GraphErrorFields = {
  code?: number | string | null
  error_subcode?: number | string | null
  /** Some endpoints spell the subcode without the `error_` prefix. */
  subcode?: number | string | null
  message?: string
  error_user_title?: string
  error_user_msg?: string
}

/**
 * `formatGraphErrorMessage` for a raw Graph `error` body. Keeps the
 * `error_subcode`/`subcode` and `error_user_msg`/`error_user_title` fallbacks
 * in one place rather than once per integration.
 */
export function formatGraphError(error?: GraphErrorFields): string | undefined {
  if (!error) {
    return
  }
  return formatGraphErrorMessage({
    code: error.code,
    subCode: error.error_subcode ?? error.subcode,
    message: error.message,
    userMessage: error.error_user_msg ?? error.error_user_title,
  })
}
