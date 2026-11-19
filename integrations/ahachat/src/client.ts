import ky, { isTimeoutError } from "ky"
import type { z } from "zod"
import {
  AHACHAT_API_BASE_URL_ENV,
  AHACHAT_HTTP_TIMEOUT_MS,
  AHACHAT_MAX_RESPONSE_BYTES,
} from "./constants"
import {
  AhachatApiError,
  type AhachatErrorCode,
  isAhachatApiError,
} from "./error"
import { resolveAhachatExportKey } from "./keys"
import { ahachatEnvelopeSchema } from "./schemas"
import { buildSignedHeaders } from "./signer"

const TRAILING_SLASHES = /\/+$/

/** HTTP status → error code; anything else non-2xx is a server error. */
const STATUS_ERROR_CODES: Record<number, AhachatErrorCode> = {
  400: "invalidRequest",
  401: "unauthorized",
  403: "unauthorized",
  404: "notFound",
  // The page resolves to more than one AhaChat page: it cannot be exported, which
  // fails that page only (like a page that is gone), never the whole run.
  409: "notFound",
  422: "invalidRequest",
  429: "rateLimited",
}

const RETRY_AFTER_SECONDS = /^\d+$/

/**
 * `Retry-After` as whole seconds only. Anything else (an HTTP date, "12abc",
 * a negative or huge number) is no hint, and the caller's default applies.
 */
const parseRetryAfter = (value: string | null): number | undefined => {
  const trimmed = value?.trim()
  if (!(trimmed && RETRY_AFTER_SECONDS.test(trimmed))) {
    return
  }
  const seconds = Number(trimmed)
  return Number.isSafeInteger(seconds) ? seconds : undefined
}

/**
 * The operator-configured AhaChat base URL (path included). Only an `https` URL without
 * credentials is accepted, so a misconfiguration can never send the token
 * in clear text or to a URL carrying a userinfo part.
 */
export const resolveAhachatApiBaseUrl = (): string => {
  const raw = process.env[AHACHAT_API_BASE_URL_ENV]?.trim()
  if (!raw) {
    throw new AhachatApiError({ code: "notConfigured", statusCode: 503 })
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AhachatApiError({ code: "notConfigured", statusCode: 503 })
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AhachatApiError({ code: "notConfigured", statusCode: 503 })
  }
  return `${url.origin}${url.pathname.replace(TRAILING_SLASHES, "")}/`
}

/**
 * Whether the AhaChat sync is configured: the base URL and a valid key
 * contract are both present. The sync is shown and usable only then.
 */
export const isAhachatConfigured = (): boolean => {
  try {
    resolveAhachatApiBaseUrl()
    resolveAhachatExportKey()
    return true
  } catch {
    return false
  }
}

/** The deadline signal fired, while connecting or while the body streamed. */
const isDeadlineError = (error: unknown) =>
  isTimeoutError(error) ||
  (error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError"))

/**
 * A failed call as a classified error that keeps nothing of the original:
 * a transport error's message can echo request headers, i.e. the API key.
 */
const toSanitizedError = (error: unknown): AhachatApiError => {
  if (isAhachatApiError(error)) {
    return error
  }
  if (isDeadlineError(error)) {
    return new AhachatApiError({ code: "timeout", statusCode: 503 })
  }
  // Any other failure to complete the call (reset, DNS, a rejected header)
  // is a transport failure, retried like a network error.
  return new AhachatApiError({ code: "network", statusCode: 503 })
}

const tooLarge = () =>
  new AhachatApiError({ code: "responseTooLarge", statusCode: 502 })

/** Reads the body chunk by chunk and stops as soon as it passes the cap. */
const readBodyCapped = async (response: Response): Promise<Uint8Array> => {
  const declared = Number(response.headers.get("Content-Length"))
  if (Number.isFinite(declared) && declared > AHACHAT_MAX_RESPONSE_BYTES) {
    throw tooLarge()
  }
  if (!response.body) {
    return new Uint8Array()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > AHACHAT_MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/**
 * The JSON body, or `undefined` when it is not JSON. A body over
 * `AHACHAT_MAX_RESPONSE_BYTES` is refused while it streams, declared or not,
 * so a misbehaving source cannot exhaust a worker shared with other workspaces.
 */
const readJsonCapped = async (response: Response): Promise<unknown> => {
  const body = await readBodyCapped(response)
  try {
    return JSON.parse(new TextDecoder().decode(body))
  } catch {
    return
  }
}

/**
 * A redirect or non-2xx status as a classified error. The unread body is
 * cancelled first, so the connection is released now instead of at GC.
 */
const assertSuccessStatus = async (response: Response): Promise<void> => {
  if (response.ok) {
    return
  }
  await response.body?.cancel().catch(() => undefined)
  if (response.status >= 300 && response.status < 400) {
    throw new AhachatApiError({ code: "redirect", statusCode: 502 })
  }
  throw new AhachatApiError({
    code: STATUS_ERROR_CODES[response.status] ?? "serverError",
    statusCode: response.status,
    retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
  })
}

/**
 * One signed POST against the AhaChat contact export API. The JSON text that
 * is hashed and signed is the exact text that is sent. Redirects are not
 * followed (the API key must only reach the configured origin) and nothing
 * from the response body is ever surfaced in an error.
 */
export async function ahachatRequest<T>(
  resource: string,
  requestBody: Record<string, unknown>,
  dataSchema: z.ZodType<T>,
  abortSignal?: AbortSignal,
): Promise<T> {
  const url = new URL(`${resolveAhachatApiBaseUrl()}${resource}`)
  const key = resolveAhachatExportKey()
  const body = JSON.stringify(requestBody)
  let payload: unknown
  try {
    const signedHeaders = await buildSignedHeaders(key, {
      path: url.pathname,
      body,
    })
    const response = await ky(url.toString(), {
      method: "post",
      body,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...signedHeaders,
      },
      redirect: "manual",
      retry: 0,
      throwHttpErrors: false,
      // ky's own timeout ends with the headers; this deadline also bounds
      // reading the body, so a stalled body cannot hold the worker.
      timeout: false,
      // The deadline, and the caller's own abort (a lost claim, a cancel).
      signal: abortSignal
        ? AbortSignal.any([
            AbortSignal.timeout(AHACHAT_HTTP_TIMEOUT_MS),
            abortSignal,
          ])
        : AbortSignal.timeout(AHACHAT_HTTP_TIMEOUT_MS),
    })
    await assertSuccessStatus(response)
    payload = await readJsonCapped(response)
  } catch (error) {
    throw toSanitizedError(error)
  }

  const parsed = ahachatEnvelopeSchema(dataSchema).safeParse(payload)
  if (!parsed.success) {
    throw new AhachatApiError({ code: "invalidResponse", statusCode: 502 })
  }
  return parsed.data.data
}
