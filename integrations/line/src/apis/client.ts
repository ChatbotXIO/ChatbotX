import { AuthException } from "@chatbotx.io/sdk"
import ky, { isHTTPError } from "ky"
import { LineAPIException } from "../exception"
import { logger } from "../lib/logger"
import type { LineAuthValue } from "../schema"

export const LINE_API_HOST = "https://api.line.me"
export const LINE_DATA_HOST = "https://api-data.line.me"

export type LineRequest = {
  method: "GET" | "POST" | "PUT"
  path: string
  body?: unknown
  host?: "api" | "data"
  retryKey?: string
  /** Return the raw `Response` body bytes (content download) instead of JSON. */
  raw?: true
}

const HTTP_UNAUTHORIZED = 401
const HTTP_CONFLICT = 409

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function lineFetch<T>(
  auth: LineAuthValue,
  req: LineRequest,
): Promise<T> {
  const base = req.host === "data" ? LINE_DATA_HOST : LINE_API_HOST
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.tokens.accessToken}`,
  }
  if (req.retryKey) {
    headers["X-Line-Retry-Key"] = req.retryKey
  }

  // A POST is only safe to retry when LINE can de-duplicate it by retry key
  // (the same header is re-sent on every retry). ky retries status codes only
  // through its HTTPError path, so `throwHttpErrors` must stay on.
  const retryable = req.method === "GET" || req.retryKey !== undefined
  let response: Response
  try {
    response = await ky(`${base}${req.path}`, {
      method: req.method,
      headers,
      json: req.body,
      timeout: 30_000,
      retry: retryable
        ? {
            limit: 2,
            methods: ["get", "post", "put"],
            statusCodes: [500, 502, 503, 504],
            delay: (attempt) => 200 * attempt,
          }
        : { limit: 0 },
    })
  } catch (error) {
    if (!isHTTPError(error)) {
      throw error
    }
    if (error.response.status === HTTP_CONFLICT && req.retryKey) {
      return error.data as T
    }
    return failWith(req, error.response, error.data)
  }

  if (req.raw) {
    return (await response.arrayBuffer()) as T
  }
  return (await readBody(response)) as T
}

function failWith(req: LineRequest, response: Response, data: unknown): never {
  const body = data as { message?: string } | undefined
  const message =
    (typeof body === "object" ? body?.message : undefined) ??
    `LINE API ${req.method} ${req.path} failed`
  logger.error(
    { method: req.method, path: req.path, status: response.status },
    `LINE API error: ${message}`,
  )
  if (response.status === HTTP_UNAUTHORIZED) {
    throw new AuthException(message, "lineAuthError", HTTP_UNAUTHORIZED)
  }
  throw new LineAPIException(
    message,
    response.status,
    "lineError",
    null,
    undefined,
    body,
  )
}
