import { assertPublicUrl } from "@chatbotx.io/business"
import {
  fetchFollowingSafeRedirects,
  readBodyWithLimit,
} from "@chatbotx.io/filesystem"
import ky from "ky"
import { ExpectedHeavyStepError } from "./errors"

const MAX_REDIRECTS = 5

// Storage often serves a file with one of these when it knows nothing about
// it; the bytes are then the only evidence of what the file is.
const GENERIC_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "",
])

/**
 * Names a file from its first bytes. `bytes` and `sniff` travel together so a
 * sniffer that needs a longer head can never be handed a truncated one.
 */
export type ContentSniffer = {
  /** How many leading bytes `sniff` is given. */
  bytes: number
  /** Returns the file's MIME type, or `null` to reject it. */
  sniff: (head: Uint8Array) => string | null
}

type DownloadWithByteLimitOptions = {
  allowedMimeTypes?: ReadonlySet<string>
  /**
   * Used only when `content-type` is generic (see `GENERIC_CONTENT_TYPES`) and
   * not in `allowedMimeTypes`; a specific but wrong type such as `text/html` is
   * still rejected. When it returns `null` the file is rejected and the rest of
   * the body is never downloaded.
   */
  sniffer?: ContentSniffer
  label: string
  maxBytes: number
  signal: AbortSignal
  timeout?: number
  url: string
}

type DownloadedBuffer = {
  buffer: Buffer
  contentType: string
  rawContentType: string
}

function parseContentLength(response: Response): number | null {
  const header = response.headers.get("content-length")
  if (header === null) {
    return null
  }

  const parsed = Number.parseInt(header, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function assertContentLengthWithinLimit(
  response: Response,
  label: string,
  maxBytes: number,
) {
  const declared = parseContentLength(response)
  if (declared !== null && declared > maxBytes) {
    throw new ExpectedHeavyStepError(
      `${label} exceeds size limit: ${declared} bytes (max ${maxBytes})`,
    )
  }
}

async function assertSafeDownloadUrl(
  url: string,
  label: string,
): Promise<void> {
  try {
    await assertPublicUrl(url, `${label} URL`)
  } catch (error) {
    throw new ExpectedHeavyStepError(`Unsafe ${label} URL`, { cause: error })
  }
}

type SniffedBody = { mimeType: string; response: Response }

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}

/**
 * Reads just enough of the body to name the file, then hands the body back
 * intact (the bytes read are replayed first). A file `sniff` does not
 * recognise is abandoned right here: the stream is cancelled, so a large
 * non-audio download costs a few KB rather than `maxBytes`.
 */
async function sniffBody(
  response: Response,
  { bytes: sniffBytes, sniff }: ContentSniffer,
): Promise<SniffedBody | null> {
  if (!response.body) {
    return null
  }
  const reader = response.body.getReader()
  const peeked: Uint8Array[] = []
  let peekedBytes = 0
  let finished = false
  // A stream may hand over fewer bytes than asked for at a time.
  while (peekedBytes < sniffBytes && !finished) {
    const { done, value } = await reader.read()
    if (done) {
      finished = true
    } else if (value) {
      peeked.push(value)
      peekedBytes += value.byteLength
    }
  }

  const head = concatChunks(peeked, peekedBytes).subarray(0, sniffBytes)
  let mimeType: string | null = null
  try {
    mimeType = sniff(head)
  } finally {
    // Also when `sniff` throws: the stream is healthy, so it must be released.
    if (!mimeType) {
      await reader.cancel().catch(() => undefined)
    }
  }
  if (!mimeType) {
    return null
  }

  const replay = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of peeked) {
        controller.enqueue(chunk)
      }
      if (finished) {
        controller.close()
      }
    },
    async pull(controller) {
      if (finished) {
        return
      }
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
      } else if (value) {
        controller.enqueue(value)
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
  return { mimeType, response: new Response(replay) }
}

/**
 * Releases the connection of a body that will not be read. A sniffer that
 * returned `null` has already cancelled its stream, so callers pass `null`.
 */
async function discardUnread(response: Response | null): Promise<void> {
  await response?.body?.cancel().catch(() => undefined)
}

export async function downloadWithByteLimit({
  allowedMimeTypes,
  label,
  maxBytes,
  signal,
  sniffer,
  timeout,
  url,
}: DownloadWithByteLimitOptions): Promise<DownloadedBuffer> {
  const { response } = await fetchFollowingSafeRedirects({
    errors: {
      tooManyRedirects: () =>
        new ExpectedHeavyStepError(`${label} download exceeded redirect limit`),
      noLocationHeader: () =>
        new ExpectedHeavyStepError(`${label} redirect has no location`),
      invalidRedirectLocation: (_location, cause) =>
        new ExpectedHeavyStepError(
          `${label} redirect has an invalid location`,
          {
            cause,
          },
        ),
    },
    fetchImpl: (candidateUrl) =>
      ky.get(candidateUrl, {
        redirect: "manual",
        signal,
        throwHttpErrors: false,
        timeout,
      }),
    maxRedirectHops: MAX_REDIRECTS,
    url,
    validateUrl: (candidateUrl) => assertSafeDownloadUrl(candidateUrl, label),
  })

  if (!response.ok) {
    const message = `${label} download failed with status ${response.status}`
    if (response.status >= 500) {
      throw new Error(message)
    }
    throw new ExpectedHeavyStepError(message)
  }

  assertContentLengthWithinLimit(response, label, maxBytes)

  const rawContentType = response.headers.get("content-type") ?? ""
  let contentType = rawContentType.split(";")[0]?.trim() ?? ""
  let body = response
  if (allowedMimeTypes && !allowedMimeTypes.has(contentType)) {
    const canSniff = sniffer && GENERIC_CONTENT_TYPES.has(contentType)
    const sniffed = canSniff ? await sniffBody(response, sniffer) : null
    if (!(sniffed && allowedMimeTypes.has(sniffed.mimeType))) {
      await discardUnread(sniffed?.response ?? (canSniff ? null : response))
      throw new ExpectedHeavyStepError(
        `Unsupported ${label} format: ${rawContentType || "unknown"}`,
      )
    }
    contentType = sniffed.mimeType
    body = sniffed.response
  }

  const buffer = await readBodyWithLimit(
    body,
    maxBytes,
    (limit) =>
      new ExpectedHeavyStepError(
        `${label} body exceeds size limit: >${limit} bytes`,
      ),
  )
  return { buffer, contentType, rawContentType }
}
