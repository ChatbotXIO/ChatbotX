import { toPublicErrorMessage } from "@chatbotx.io/business/errors"

const numericProperty = (
  value: unknown,
  property: "graphCode" | "statusCode",
): number | undefined => {
  if (typeof value !== "object" || value === null) {
    return
  }
  const candidate = Reflect.get(value, property)
  return typeof candidate === "number" ? candidate : undefined
}

/**
 * Meta can return developer-authored text, so never attach the original error
 * object to a log entry: Pino would serialize its message and stack verbatim.
 * Keep only redacted text plus non-secret classification fields.
 */
export const safeMetaCatalogErrorLog = (
  error: unknown,
  fallback: string,
): {
  details: {
    error: string
    errorType: string
    graphCode?: number
    statusCode?: number
  }
  message: string
} => {
  const message = toPublicErrorMessage(error, fallback)
  const graphCode = numericProperty(error, "graphCode")
  const statusCode = numericProperty(error, "statusCode")
  return {
    details: {
      error: message,
      errorType: error instanceof Error ? error.name : typeof error,
      ...(graphCode === undefined ? {} : { graphCode }),
      ...(statusCode === undefined ? {} : { statusCode }),
    },
    message,
  }
}
