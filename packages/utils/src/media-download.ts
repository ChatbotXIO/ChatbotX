/** Default timeout for bounded remote-media downloads. */
export const DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS = 15_000
// Keep bounded request-facing media downloads from allocating arbitrary memory.
export const DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024

/**
 * Thrown when a response body exceeds the configured byte cap — either because
 * its declared `content-length` is already too large, or because the streamed
 * body grew past the cap mid-read. Callers that need to distinguish "too large"
 * from other failures can narrow on this type.
 */
export class MediaTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MediaTooLargeError"
  }
}

/** Thrown when a response has no readable body to stream. */
export class MediaEmptyBodyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MediaEmptyBodyError"
  }
}

export type FetchedMedia = {
  bytes: ArrayBuffer
  mimeType: string
}

/**
 * Best-effort release of a response body or its reader so the underlying
 * connection is freed promptly instead of lingering until the request times out
 * or is garbage-collected. A cancellation failure must never mask the real error
 * the caller is about to throw, so it is swallowed.
 */
export const cancelBodyQuietly = async (
  cancellable: { cancel: () => Promise<unknown> } | null | undefined,
): Promise<void> => {
  try {
    await cancellable?.cancel()
  } catch {
    // Intentionally ignored — releasing the connection is best-effort.
  }
}

export type ReadBodyWithCapOptions = {
  maxBytes: number
  /** Prefix used in error messages to identify the caller/resource. */
  label: string
}

/**
 * Stream a response body into an `ArrayBuffer`, aborting as soon as the
 * accumulated size exceeds `maxBytes`. A declared `content-length` over the cap
 * is rejected up front without reading the body; otherwise the stream is read
 * chunk-by-chunk and cancelled the moment the running total crosses the cap, so
 * an oversized or `content-length`-less response can never buffer more than one
 * chunk past the limit. Throws {@link MediaTooLargeError} when the cap is
 * exceeded and {@link MediaEmptyBodyError} when there is no body to read.
 */
export const readBodyWithCap = async (
  response: Response,
  { maxBytes, label }: ReadBodyWithCapOptions,
): Promise<ArrayBuffer> => {
  const declaredHeader = response.headers.get("content-length")
  if (declaredHeader !== null) {
    const declared = Number.parseInt(declaredHeader, 10)
    if (!Number.isNaN(declared) && declared > maxBytes) {
      await cancelBodyQuietly(response.body)
      throw new MediaTooLargeError(
        `${label} exceeds size limit: ${declared} bytes (max ${maxBytes})`,
      )
    }
  }

  if (!response.body) {
    throw new MediaEmptyBodyError(`${label} has no response body`)
  }

  const reader = response.body.getReader()
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
      // A cancellation failure must not escape in place of the size error, or
      // callers that key on MediaTooLargeError (e.g. the attachment pipeline's
      // terminal "too-large" decision) would mistake it for a retryable fault.
      await cancelBodyQuietly(reader)
      throw new MediaTooLargeError(
        `${label} body exceeds size limit: >${maxBytes} bytes`,
      )
    }
    chunks.push(value)
  }

  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output.buffer
}

export type FetchMediaOptions = {
  headers?: Record<string, string>
  timeoutMs?: number
  maxBytes?: number
  fallbackMimeType?: string
}

/**
 * Fetch a remote media URL with a timeout and a true streaming size cap.
 * Returns `null` when the response is not usable (non-2xx or no body) and
 * throws {@link MediaTooLargeError} when the body exceeds `maxBytes`. The body
 * is streamed and aborted at the cap (see {@link readBodyWithCap}), so memory
 * use stays bounded even for a chunked response with no `content-length`. Used
 * on request-facing paths (e.g. on-demand avatar mirroring) where an unbounded
 * `fetch().arrayBuffer()` could hang the caller or allocate arbitrary memory.
 */
export const fetchMediaWithLimits = async (
  url: string,
  options: FetchMediaOptions = {},
): Promise<FetchedMedia | null> => {
  const {
    headers,
    timeoutMs = DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS,
    maxBytes = DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES,
    fallbackMimeType = "image/png",
  } = options

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!(response.ok && response.body)) {
    // Release the connection instead of leaving the socket open until timeout.
    await cancelBodyQuietly(response.body)
    return null
  }

  const bytes = await readBodyWithCap(response, { maxBytes, label: "Media" })

  return {
    bytes,
    mimeType: response.headers.get("content-type") ?? fallbackMimeType,
  }
}
