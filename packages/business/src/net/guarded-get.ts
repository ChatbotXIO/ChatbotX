import { pinnedGet } from "./pinned-fetch"
import { checkSsrfSafety } from "./ssrf-guard"

/**
 * Node-only (undici, through `pinned-fetch`). Not re-exported from the package
 * index (AGENTS.md invariant 25). The one redirect-following, SSRF-vetted GET
 * the feed fetchers (feed, picture, article page) share; each caller maps the
 * failures to its own error type.
 */

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
])

/** Why a guarded GET stopped before it had a final answer. */
export type GuardedGetFailure =
  /** The address is not a web address. */
  | "notWeb"
  /** The address resolves somewhere that is not allowed. */
  | "blocked"
  | "timeout"
  | "unreachable"
  /** A redirect without a usable `Location`. */
  | "noLocation"
  | "tooManyRedirects"

/** The media type of a `Content-Type` header, lower case, without parameters. */
export const baseContentType = (value: string | null): string =>
  (value ?? "").split(";")[0]?.trim().toLowerCase() ?? ""

/** Reads at most `maxBytes`; a longer body aborts the read and throws `onTooLarge()`. */
export const readCapped = async (
  response: Response,
  maxBytes: number,
  onTooLarge: () => Error,
): Promise<Buffer> => {
  const reader = response.body?.getReader()
  if (!reader) {
    return Buffer.alloc(0)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw onTooLarge()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

const hasWebProtocol = (url: URL): boolean =>
  url.protocol === "https:" || url.protocol === "http:"

/**
 * GETs `start`, following at most `maxRedirects` redirects. Every hop is vetted
 * and requested as one step on a socket pinned to the vetted address. Returns
 * the first answer that is not a redirect and the address it came from; the
 * caller reads the body (and must cancel it).
 */
export const guardedGet = async (input: {
  fail: (failure: GuardedGetFailure) => Error
  headers: Record<string, string>
  maxRedirects: number
  signal: AbortSignal
  start: string
}): Promise<{ finalUrl: string; response: Response }> => {
  const { fail, signal } = input
  let current = input.start
  for (let hop = 0; hop <= input.maxRedirects; hop++) {
    let url: URL
    try {
      url = new URL(current)
    } catch {
      throw fail("notWeb")
    }
    if (!hasWebProtocol(url)) {
      throw fail("notWeb")
    }
    const verdict = await checkSsrfSafety(current)
    const address = verdict.unsafe ? null : verdict.resolvedIps[0]
    if (!address) {
      throw fail("blocked")
    }
    let response: Response
    try {
      response = await pinnedGet({
        address,
        headers: input.headers,
        signal,
        url: current,
      })
    } catch {
      throw fail(signal.aborted ? "timeout" : "unreachable")
    }
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { finalUrl: current, response }
    }
    await response.body?.cancel().catch(() => undefined)
    const location = response.headers.get("location")
    try {
      if (!location) {
        throw new Error("no location")
      }
      current = new URL(location, current).toString()
    } catch {
      throw fail("noLocation")
    }
  }
  throw fail("tooManyRedirects")
}

/**
 * Runs `attempt` over https first when `url` is http, and over http only when
 * that fails for a reason http could change (not a size or a policy refusal,
 * which would only download the same thing twice).
 */
export const withHttpsUpgrade = async <T>(
  url: string,
  attempt: (url: string) => Promise<T>,
  canRetryOverHttp: (error: unknown) => boolean,
): Promise<T> => {
  if (!url.startsWith("http:")) {
    return await attempt(url)
  }
  try {
    return await attempt(`https:${url.slice("http:".length)}`)
  } catch (error) {
    if (!canRetryOverHttp(error)) {
      throw error
    }
    return await attempt(url)
  }
}
