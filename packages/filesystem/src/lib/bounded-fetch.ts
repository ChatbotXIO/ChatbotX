const DEFAULT_MAX_REDIRECT_HOPS = 5

/**
 * Reads a response body through a stream with a running byte counter,
 * aborting as soon as `maxBytes` is crossed instead of buffering the whole
 * body first — a lying or absent `content-length` header must not force an
 * unbounded amount of the response into memory before the cap is enforced.
 *
 * Shared by `packages/filesystem/src/lib/upload.ts` (public AI-file URL
 * ingestion) and `apps/worker/src/heavy/handlers/bounded-download.ts` (heavy
 * job downloads) — both need the identical byte-accounting behavior, only
 * differing in how they report the size-exceeded failure to their own
 * caller.
 */
export async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
  onLimitExceeded: (maxBytes: number) => Error,
): Promise<Buffer> {
  const body = response.body
  if (!body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) {
      throw onLimitExceeded(maxBytes)
    }
    return buffer
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value) {
      continue
    }

    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw onLimitExceeded(maxBytes)
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks, total)
}

export type SafeRedirectErrors = {
  invalidRedirectLocation: (location: string, cause: unknown) => Error
  noLocationHeader: () => Error
  tooManyRedirects: () => Error
}

/**
 * Fetches `url` via `fetchImpl`, manually following redirects so
 * `validateUrl` re-runs on every hop before it is requested — a plain
 * `redirect: "follow"` fetch would resolve and request each hop with zero
 * re-validation, letting a server that passes the first check redirect the
 * download to a private/internal address the caller's SSRF guard never saw.
 *
 * `fetchImpl` is injected so the worker can keep using `ky` (which carries
 * its own abort-signal/timeout handling) while `packages/filesystem`'s own
 * caller uses the platform `fetch`.
 */
export async function fetchFollowingSafeRedirects(input: {
  errors: SafeRedirectErrors
  fetchImpl: (url: string) => Promise<Response>
  maxRedirectHops?: number
  redirectsLeft?: number
  url: string
  validateUrl: (url: string) => Promise<void>
}): Promise<{ finalUrl: string; response: Response }> {
  const {
    errors,
    fetchImpl,
    maxRedirectHops = DEFAULT_MAX_REDIRECT_HOPS,
    redirectsLeft = maxRedirectHops,
    url,
    validateUrl,
  } = input

  await validateUrl(url)
  const response = await fetchImpl(url)

  if (response.status < 300 || response.status >= 400) {
    return { finalUrl: url, response }
  }
  if (redirectsLeft <= 0) {
    throw errors.tooManyRedirects()
  }
  const location = response.headers.get("location")
  if (!location) {
    throw errors.noLocationHeader()
  }

  let redirectUrl: string
  try {
    redirectUrl = new URL(location, url).href
  } catch (error) {
    throw errors.invalidRedirectLocation(location, error)
  }

  return fetchFollowingSafeRedirects({
    errors,
    fetchImpl,
    maxRedirectHops,
    redirectsLeft: redirectsLeft - 1,
    url: redirectUrl,
    validateUrl,
  })
}
