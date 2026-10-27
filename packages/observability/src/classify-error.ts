import { ChannelError } from "@chatbotx.io/sdk"
import { ZodError } from "zod"
import type { ErrorClass } from "./metrics"

const CODE_BUG_CODES = new Set(["23502"])
const TRANSIENT_DATABASE_CODES = new Set(["40001", "40P01", "53300", "57014"])

const getProperty = (value: object, key: string): unknown => {
  try {
    return Reflect.get(value, key)
  } catch {
    return
  }
}

const getErrorCode = (error: unknown): string | undefined => {
  let current = error
  const seen = new Set<object>()

  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) {
      return
    }
    seen.add(current)

    const code = getProperty(current, "code")
    if (typeof code === "string") {
      return code
    }
    current = getProperty(current, "cause")
  }
}

const getHttpStatus = (error: unknown): number | undefined => {
  let current = error
  const seen = new Set<object>()

  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) {
      return
    }
    seen.add(current)

    const status = getProperty(current, "status")
    if (typeof status === "number") {
      return status
    }

    const response = getProperty(current, "response")
    if (response && typeof response === "object") {
      const responseStatus = getProperty(response, "status")
      if (typeof responseStatus === "number") {
        return responseStatus
      }
    }
    current = getProperty(current, "cause")
  }
}

const isConnectionError = (code: string | undefined): boolean =>
  code === "ECONNREFUSED" ||
  code === "ECONNRESET" ||
  code === "ECONNABORTED" ||
  code === "ETIMEDOUT" ||
  code === "EHOSTUNREACH" ||
  code === "ENETUNREACH"

export const classifyError = (error: unknown): ErrorClass => {
  if (error instanceof TypeError || error instanceof ReferenceError) {
    return "code_bug"
  }
  if (error instanceof ZodError) {
    return "code_bug"
  }

  if (error instanceof ChannelError) {
    return "third_party"
  }

  const code = getErrorCode(error)
  if (code?.startsWith("42") || (code && CODE_BUG_CODES.has(code))) {
    return "code_bug"
  }

  if ((code && TRANSIENT_DATABASE_CODES.has(code)) || isConnectionError(code)) {
    return "db_transient"
  }

  const status = getHttpStatus(error)
  if (status && status >= 400 && status <= 599) {
    return "third_party"
  }

  return "unknown"
}
