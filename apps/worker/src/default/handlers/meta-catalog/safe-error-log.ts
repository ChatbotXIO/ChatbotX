import { toPublicErrorMessage } from "@chatbotx.io/business/errors"

const SAFE_FB_TRACE_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/

const numericProperty = (
  value: unknown,
  property: "graphCode" | "graphSubcode" | "statusCode",
): number | undefined => {
  if (typeof value !== "object" || value === null) {
    return
  }
  const candidate = Reflect.get(value, property)
  return typeof candidate === "number" ? candidate : undefined
}

const stringProperty = (
  value: unknown,
  property: "fbTraceId",
): string | undefined => {
  if (typeof value !== "object" || value === null) {
    return
  }
  const candidate = Reflect.get(value, property)
  return typeof candidate === "string" && SAFE_FB_TRACE_ID_REGEX.test(candidate)
    ? candidate
    : undefined
}

const isMappedMetaCatalogError = (error: unknown): error is Error =>
  error instanceof Error &&
  error.name === "MetaCatalogException" &&
  numericProperty(error, "statusCode") !== undefined

const toSafeLogError = (
  error: unknown,
  sanitizedMessage: string,
): Error | undefined => {
  if (!isMappedMetaCatalogError(error)) {
    return
  }
  const safeError = new Error(sanitizedMessage)
  safeError.name = error.name
  return safeError
}

/**
 * Meta can return developer-authored text, and an upstream HTTPError may carry
 * request headers. Only a sanitized clone of the integration's mapped
 * exception is attached to `err`. Its stack is freshly created here because a
 * multiline upstream message can occupy apparent "stack" lines and restore
 * credentials removed from the public message. Unknown errors remain reduced
 * to safe classification fields.
 */
export const safeMetaCatalogErrorLog = (
  error: unknown,
  fallback: string,
): {
  details: {
    err?: Error
    error: string
    errorType: string
    graphCode?: number
    graphSubcode?: number
    fbTraceId?: string
    statusCode?: number
  }
  message: string
} => {
  const message = toPublicErrorMessage(error, fallback)
  const graphCode = numericProperty(error, "graphCode")
  const graphSubcode = numericProperty(error, "graphSubcode")
  const fbTraceId = stringProperty(error, "fbTraceId")
  const statusCode = numericProperty(error, "statusCode")
  const safeError = toSafeLogError(error, message)
  return {
    details: {
      ...(safeError ? { err: safeError } : {}),
      error: message,
      errorType: error instanceof Error ? error.name : typeof error,
      ...(graphCode === undefined ? {} : { graphCode }),
      ...(graphSubcode === undefined ? {} : { graphSubcode }),
      ...(fbTraceId === undefined ? {} : { fbTraceId }),
      ...(statusCode === undefined ? {} : { statusCode }),
    },
    message,
  }
}
