import { ChannelError } from "@chatbotx.io/sdk"
import { ZodError } from "zod"
import type { ErrorClass } from "./metrics"

const CODE_BUG_CODES = new Set(["23502"])
const TRANSIENT_DATABASE_CODES = new Set(["40001", "40P01", "53300", "57014"])
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
])

const getProperty = (value: object, key: string): unknown => {
  try {
    return Reflect.get(value, key)
  } catch {
    return
  }
}

const findInCauseChain = <Value>(
  error: unknown,
  pick: (current: object) => Value | undefined,
): Value | undefined => {
  let current = error
  const seen = new Set<object>()

  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) {
      return
    }
    seen.add(current)

    const value = pick(current)
    if (value !== undefined) {
      return value
    }
    current = getProperty(current, "cause")
  }
}

const getErrorCode = (error: unknown): string | undefined =>
  findInCauseChain(error, (current) => {
    const code = getProperty(current, "code")
    return typeof code === "string" ? code : undefined
  })

const getHttpStatus = (error: unknown): number | undefined =>
  findInCauseChain(error, (current) => {
    const status = getProperty(current, "status")
    if (typeof status === "number") {
      return status
    }

    const response = getProperty(current, "response")
    if (!response || typeof response !== "object") {
      return
    }

    const responseStatus = getProperty(response, "status")
    return typeof responseStatus === "number" ? responseStatus : undefined
  })

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

  if (
    (code && TRANSIENT_DATABASE_CODES.has(code)) ||
    (code && CONNECTION_ERROR_CODES.has(code))
  ) {
    return "db_transient"
  }

  const status = getHttpStatus(error)
  if (status && status >= 400 && status <= 599) {
    return "third_party"
  }

  return "unknown"
}
