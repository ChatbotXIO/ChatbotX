export interface ParsedError {
  code: number
  message: string
}

const INTERNAL_ERROR: ParsedError = {
  message: "internal error",
  code: -1900,
}

const JSON_ERROR_REGEX = /\{[\s\S]*\}/

type FacebookAPIError = {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
    type?: string
    fbtrace_id?: string
  }
}

type ZaloAPIError = {
  error?: number
  message?: string
}

function parseMessengerError(errorData: unknown): ParsedError {
  console.log("parseMessengerError", errorData)
  if (!errorData || typeof errorData !== "object") {
    return INTERNAL_ERROR
  }

  const err = errorData as FacebookAPIError
  if (err.error?.message && typeof err.error.code === "number") {
    return {
      message: err.error.message,
      code: err.error.code,
    }
  }

  if (errorData instanceof Error) {
    const parsed = tryParseJSONError(errorData.message)
    if (parsed) {
      return parsed
    }
  }

  return INTERNAL_ERROR
}

function parseWhatsappError(errorData: unknown): ParsedError {
  if (!errorData || typeof errorData !== "object") {
    return INTERNAL_ERROR
  }

  const err = errorData as FacebookAPIError
  if (err.error?.message && typeof err.error.code === "number") {
    return {
      message: err.error.message,
      code: err.error.code,
    }
  }

  if (errorData instanceof Error) {
    const parsed = tryParseJSONError(errorData.message)
    if (parsed) {
      return parsed
    }
  }

  return INTERNAL_ERROR
}

function parseZaloError(errorData: unknown): ParsedError {
  if (!errorData || typeof errorData !== "object") {
    return INTERNAL_ERROR
  }

  const err = errorData as ZaloAPIError
  if (err.message && typeof err.error === "number" && err.error !== 0) {
    return {
      message: err.message,
      code: err.error,
    }
  }

  if (errorData instanceof Error) {
    const parsed = tryParseJSONError(errorData.message)
    if (parsed) {
      return parsed
    }
  }

  return INTERNAL_ERROR
}

function tryParseJSONError(message: string): ParsedError | null {
  try {
    const match = message.match(JSON_ERROR_REGEX)
    if (match) {
      const json = JSON.parse(match[0])

      if (json.error?.message && typeof json.error?.code === "number") {
        return {
          message: json.error.message,
          code: json.error.code,
        }
      }

      if (json.message && typeof json.error === "number") {
        return {
          message: json.message,
          code: json.error,
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

const channelParsers: Record<string, (errorData: unknown) => ParsedError> = {
  messenger: parseMessengerError,
  whatsapp: parseWhatsappError,
  zalo: parseZaloError,
}

export function parseErrorData(
  errorData: unknown,
  channel: string,
): ParsedError {
  const parser = channelParsers[channel]
  if (!parser) {
    return INTERNAL_ERROR
  }

  return parser(errorData)
}
