import type { IncomingMessage, ServerResponse } from "node:http"
import { resolveHeaderValue } from "../http-headers"

export const MAX_BODY_BYTES = 1024 * 1024

export class PayloadTooLargeError extends Error {}

export const writeJsonRpcError = (
  res: ServerResponse,
  statusCode: number,
  message: string,
  wwwAuthenticate?: string,
): void => {
  if (wwwAuthenticate) {
    res.setHeader("WWW-Authenticate", wwwAuthenticate)
  }
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32_000, message },
    }),
  )
}

export const parseRequestBody = async (
  req: IncomingMessage,
): Promise<unknown> => {
  const contentLength = Number(
    resolveHeaderValue(req.headers["content-length"]),
  )
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError()
  }

  const chunks: Buffer[] = []
  let bodyBytes = 0
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk
    bodyBytes += buffer.byteLength
    if (bodyBytes > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError()
    }
    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim()
  if (rawBody.length === 0) {
    return
  }

  return JSON.parse(rawBody) as unknown
}

export const writePlainText = (
  res: ServerResponse,
  statusCode: number,
  message: string,
): void => {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.end(message)
}
